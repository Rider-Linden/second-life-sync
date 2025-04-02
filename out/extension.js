"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
function closeAllInstances(filePath) {
}
function activate(context) {
    // Tracks all active sync relationships between temp files and master files
    const activeSyncs = new Map();
    /**
     * Sets up syncing from a master script to a SL temp script file
     * @param tempFilePath - Full path to the SL temporary script file
     */
    function setupSync(tempFilePath) {
        const openedBase = path.basename(tempFilePath);
        // Match file names like: sl_script_<scriptName>_<uuid>.luau or .lsl
        const match = openedBase.match(/^sl_script_(.+)_([a-fA-F0-9]{32}|[a-fA-F0-9-]{36})\.(luau|lsl)$/);
        if (!match) {
            return;
        } // Not a valid SL temp script file;
        const scriptName = match[1]; // extracted script name
        const extension = match[3]; // either "lsl" or "luau"
        // Remove any previous syncs for this temp file to avoid duplicates
        if (activeSyncs.has(tempFilePath)) {
            activeSyncs.get(tempFilePath)?.dispose();
            activeSyncs.delete(tempFilePath);
        }
        // Look for a file in the workspace with the same name as the master script
        vscode.workspace.findFiles(`**/${scriptName}.${extension}`, '**/node_modules/**').then(async (files) => {
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
                    fs.copyFile(masterPath, tempFilePath, (err) => {
                        if (err) {
                            vscode.window.showErrorMessage(`Failed to sync to temporary file: ${err.message}`);
                        }
                        else {
                            vscode.window.setStatusBarMessage(`Synced ${scriptName} to Second Life`, 3000);
                        }
                    });
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
function deactivate() { }
//# sourceMappingURL=extension.js.map