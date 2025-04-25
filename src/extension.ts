import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * This extension listens for Second Life temporary script files being opened.
 * When a file like sl_script_<name>_<uuid>.lsl or .luau is opened:
 * - It searches for a master file named <name>.lsl or .luau
 * - Opens the master file in the editor
 * - Syncs changes from the master file to the temp file whenever the master is saved
 * - Stops syncing if the temp file is deleted
 * - Restarts syncing if the temp file is recreated
 */

// This helper function will force any open instance (even if hidden) of the document to be shown and then closed.
function closeAllInstances(filePath: string) {
}

export function activate(context: vscode.ExtensionContext) {
	// Tracks all active sync relationships between temp files and master files
	const activeSyncs = new Map<string, vscode.Disposable>();

	/**
	 * Sets up syncing from a master script to a SL temp script file
	 * @param tempFilePath - Full path to the SL temporary script file
	 */
	function setupSync(tempFilePath: string) {
		const openedBase = path.basename(tempFilePath);

		// Match file names like: sl_script_<scriptName>_<uuid>.luau or .lsl
		const match = openedBase.match(/^sl_script_(.+)_([a-fA-F0-9]{32}|[a-fA-F0-9-]{36})\.(luau|lsl)$/);
		if (!match) { return; } // Not a valid SL temp script file;

		const scriptName = match[1]; // extracted script name
		const extension = match[3];  // either "lsl" or "luau"

		// Remove any previous syncs for this temp file to avoid duplicates
		if (activeSyncs.has(tempFilePath)) {
			activeSyncs.get(tempFilePath)?.dispose();
			activeSyncs.delete(tempFilePath);
		}

		// Look for a file in the workspace with the same name as the master script
		vscode.workspace.findFiles(`**/${scriptName}.${extension}`).then(async (files) => {
			if (files.length === 0) {
				vscode.window.showWarningMessage(`No master script found for: ${scriptName}.${extension}`);
				return;
			}

			const masterUri = files[0];
			const masterPath = masterUri.fsPath;

			// Open the master script file in the editor
			vscode.window.showInformationMessage(`Opening master copy: ${path.basename(masterPath)}`);
			const masterDoc = await vscode.workspace.openTextDocument(masterUri);
			vscode.window.showTextDocument(masterDoc, { preview: false });

			// Set up a listener to copy the master file to the temp file when it's saved
			const saveListener = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
				if (savedDoc.fileName === masterPath) {
					(async () => {
						try {
							const data = await fs.promises.readFile(masterPath, 'utf8');
							const wsFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
							if (!wsFolder) {
								vscode.window.showErrorMessage('No workspace folder found');
								return;
							}
							// Preprocess: set regex based on file extension
							let regex: RegExp;
							if (extension.toLowerCase() === 'luau') {
								regex = /--\[\[\s*require\s*\(\s*(\S+)\s*\)\s*\]\]/g;
							} else if (extension.toLowerCase() === 'lsl') {
								regex = /\/\/\s*include\s+(\S+)/g;
							} else {
								regex = /a^/; // regex that matches nothing
							}
							const matches = Array.from(data.matchAll(regex));
							let processedContent = data;
							for (const match of matches) {
								const directive = match[0];
								let includeName = match[1];
								// If includeName does not have an extension, add the master file's extension.
								if (path.extname(includeName) === '') {
									includeName = includeName + '.' + extension;
								}
								//const includeUris = await vscode.workspace.findFiles(`**/include/${includeName}`, undefined, 1);
								let includeGlob ='**/include/' + includeName;
								const includeUris = await vscode.workspace.findFiles(includeGlob, undefined, 1);
								if (includeUris.length > 0) {
									const includeContent = await fs.promises.readFile(includeUris[0].fsPath, 'utf8');
									processedContent = processedContent.replace(directive, includeContent);
								} else {
									vscode.window.showWarningMessage(`Include file include/${includeName} not found`);
									// If not found, leave the directive unchanged.
									processedContent = processedContent.replace(directive, directive);
								}
							}
							await fs.promises.writeFile(tempFilePath, processedContent);
							vscode.window.setStatusBarMessage(`Synced ${scriptName} to Second Life with includes`, 3000);
						} catch (err: any) {
							vscode.window.showErrorMessage(`Error syncing file: ${err.message}`);
						}
					})();
				}
			});

			// Watch for deletion and recreation of the temp file
			const tempDir = path.dirname(tempFilePath);
			const tempName = path.basename(tempFilePath);
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(tempDir, tempName));

			// Stop syncing and close the window if the temp file is deleted
			const deleteListener = watcher.onDidDelete((uri) => {
				vscode.window.setStatusBarMessage('onDidDelete ${uri.fsPath}', 4000);
				if (uri.fsPath === tempFilePath) {
					saveListener.dispose();
					deleteListener.dispose();
					watcher.dispose();
					activeSyncs.delete(tempFilePath);
					// Close any open editor windows for the deleted temp file
					const normalizedFilePath = path.normalize(tempFilePath).toLowerCase();
					vscode.workspace.textDocuments.forEach(doc => {
						if (path.normalize(doc.fileName).toLowerCase() === normalizedFilePath) {
							// Show the document to ensure it has an associated tab,
							// then close it.
							vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true }).then(() => {
								vscode.commands.executeCommand('workbench.action.closeActiveEditor');
							});
						}
					});
					vscode.window.setStatusBarMessage(`Temporary file deleted. Sync stopped for ${scriptName}`, 4000);
				}
			 });

			 // Store all disposables to clean them up later
			const disposables = vscode.Disposable.from(saveListener, deleteListener, watcher);
			activeSyncs.set(tempFilePath, disposables);
			context.subscriptions.push(disposables);
		});
	}

	// Run sync setup when a document is opened
	vscode.workspace.onDidOpenTextDocument((document) => {
		setupSync(document.fileName);
	});
}

// Called when the extension is deactivated (automatic cleanup is handled)
export function deactivate() { }
