This tool is not endorsed or maintained by Linden Lab. 

# second-life-sync

This extension synchronizes Second Life temporary script files with a corresponding master script in your workspace. When a temporary file with a name like `sl_script_<name>_<uuid>.lsl` or `.luau` is opened, the extension automatically:

- Searches for a master file matching the script name (e.g. "<name>.lsl" or ".luau") in the current workspace.
- Opens the master script in the editor, or changes focus to it.
- Copies the contents of the master script into the temporary script.
- Monitors the master file and updates the contents back into second life.


## Known Issues

None

## Release Notes

### 0.1.0

Initial release, does this thing work?

