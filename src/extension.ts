import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { CMakeToolsApi, CMakeToolsExtensionExports, CodeModel, ConfigurationType, Project, Version } from 'vscode-cmake-tools';

const logger = vscode.window.createOutputChannel("target-launcher extension");

// https://github.com/microsoft/vscode-cmake-tools-api/tree/main/sample-extension

let api: CMakeToolsApi;
let activeProject: Project | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return;
	}

	const cmakeToolsExtension: CMakeToolsExtensionExports = await vscode.extensions.getExtension('ms-vscode.cmake-tools')?.activate();
	api = cmakeToolsExtension.getApi(Version.v3);
	activeProject = await api.getProject(vscode.Uri.file(api.getActiveFolderPath()));

	//targets = activeProject?.codeModel?.configurations;
	
	// For simplicity, watch only the first workspace folder:
	const rootFolder = vscode.workspace.workspaceFolders[0].uri;
	const targetsPattern = new vscode.RelativePattern(rootFolder, '.vscode/targets.json');
	const watcher = vscode.workspace.createFileSystemWatcher(targetsPattern);

	// Whenever targets.json is created or changed, update launch.json
	watcher.onDidCreate(uri => updateLaunchJson(uri, rootFolder));
	watcher.onDidChange(uri => updateLaunchJson(uri, rootFolder));

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "target-launcher" is now active!');

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with registerCommand
	// // The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('target-launcher.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from target-launcher!');
	// });

	// context.subscriptions.push(disposable);

	// Push the watcher into subscriptions so it closes on deactivate:
	context.subscriptions.push(watcher);
}

/**
 * Reads .vscode/targets.json, transforms it into launch configurations,
 * and writes .vscode/launch.json back to disk (merging or replacing as needed).
 *
 * @param targetsUri The Uri of the changed/created targets.json
 * @param rootFolder The Uri of the workspace’s root folder
 */
async function updateLaunchJson(targetsUri: vscode.Uri, rootFolder: vscode.Uri) {

	try {
		// 1) Read the contents of targets.json
		const targetsDoc = await vscode.workspace.openTextDocument(targetsUri);
		const targetsText = targetsDoc.getText();
		let targets: any;
		try {
			targets = jsonc.parse(targetsText);
		} catch (parseErr) {
			vscode.window.showErrorMessage(
				`Failed to parse targets.json: ${(parseErr as Error).message}`
			);
			return;
		}

		// 2) Compute the path to .vscode/launch.json
		const launchJsonPath = path.join(rootFolder.fsPath, '.vscode', 'launch.json');

		// 3) Read or initialize launch.json
		let launch: any = {};
		if (fs.existsSync(launchJsonPath)) {
			try {
				const raw = fs.readFileSync(launchJsonPath, 'utf8');
				launch = JSON.parse(raw);
			} catch (readErr) {
				// If parsing fails, notify and bail
				vscode.window.showErrorMessage(
					`Failed to read existing launch.json: ${(readErr as Error).message}`
				);
				return;
			}
		} else {
			// If launch.json doesn’t exist, start from a minimal template
			launch = {
				version: '0.2.0',
				configurations: []
			};
		}

		
		// 4) Transform targets into a list of launch configurations.
		//    Here we assume `targets` is something like:
		//      [
		//        { "name": "Launch App", "program": "app.js", "cwd": "." },
		//        { "name": "Run Tests", "program": "test/index.js" }
		//      ]
		//
		//    You can adjust the fields as needed (type, request, env, args, etc.)
		//    In this example, we’ll produce Node.js‐style launches.

		const newConfigs = (Array.isArray(targets) ? targets : []).map((t: any) => {
			// Ensure each target has at least a `name` and `program` field
			const displayName = typeof t.name === 'string' ? t.name : 'Unnamed Target';
			const programPath = typeof t.program === 'string'
				? t.program
				: '';

			// if (cmakeAPI) {
			// 	try {
			// 		// Get all targets from the CMake project
			// 		const cmakeProject = await cmakeAPI.getCMakeProjectForActiveFolder();
			// 		if (cmakeProject) {
			// 			// Get the specified target
			// 			const targetName = t.target || '';
			// 			const codeModel = await cmakeProject.codeModel;

			// 			if (codeModel && codeModel.targets) {
			// 				// Find the target by name
			// 				const target = codeModel.targets.find(
			// 					(tgt: any) => tgt.name === targetName
			// 				);

			// 				if (target && target.artifacts && target.artifacts.length > 0) {
			// 					// Get the first artifact (usually the executable)
			// 					programPath = target.artifacts[0];
			// 				}
			// 			}
			// 		}
			// 	} catch (cmakeError) {
			// 		console.error('Error accessing CMake Tools API:', cmakeError);
			// 	}
			// }







			// You can add more properties (cwd, args, env) if present in t.
			return {
				name: displayName,
				type: 'node',
				request: 'launch',
				program: `\${workspaceFolder}/${programPath}`,
				cwd: t.cwd ? `\${workspaceFolder}/${t.cwd}` : '${workspaceFolder}',
				args: Array.isArray(t.args) ? t.args : [],
				env: typeof t.env === 'object' ? t.env : {}
			};
		});

		// 5) Replace (or merge) the configurations in launch.json
		//    Here we simply replace the entire `configurations` array:
		launch.configurations = newConfigs;

		// 6) Write launch.json back to disk (pretty‐printed with 2‐space indent)
		const newContent = JSON.stringify(launch, null, 2);
		fs.mkdirSync(path.dirname(launchJsonPath), { recursive: true });
		fs.writeFileSync(launchJsonPath, newContent, 'utf8');

		// Optionally, show a notification:
		vscode.window.showInformationMessage(
			`launch.json updated with ${newConfigs.length} configuration(s).`
		);
	} catch (err) {
		console.error('Error in updateLaunchJson:', err);
		// Fail silently or notify user
		vscode.window.showErrorMessage(
			`Unexpected error updating launch.json: ${(err as Error).message}`
		);
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
