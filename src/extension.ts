import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { CMakeToolsApi, CMakeToolsExtensionExports, CodeModel, ConfigurationType, Project, Version } from 'vscode-cmake-tools';
import { TargetTreeProvider } from './targets-provider';
import { TargetNode, TargetsModel, TreeNode } from './targets-model';
import { TerminalManager } from './terminal-manager';

const logger = vscode.window.createOutputChannel("target-launcher extension");

let cmake_api: CMakeToolsApi;
let activeProject: Project | undefined;
let targetsMap: Map<string, Map<string, string>> = new Map();
let currentCMakeConfig: vscode.StatusBarItem;
let terminalManager: TerminalManager;

let targetsModel: TargetsModel;
let targetsView: vscode.TreeView<TreeNode>;
let targetsProvider: TargetTreeProvider;

// https://github.com/microsoft/vscode-cmake-tools-api/tree/main/sample-extension
// https://github.com/arthurvaverko/launch-sidebar-extension
// https://code.visualstudio.com/api/references/icons-in-labels#icon-listing

function print(string: string, numTabs = 0): void {
	// let value = "";
	// for (let i = 0; i < numTabs; i++) {
	// 	value += "\t";
	// }
	// logger.appendLine(`${value}${string}`);
	// logger.show();
}

async function updateCMakeCodeModel(codemodel: CodeModel.Content): Promise<void> {

	// Collect executable targets

	codemodel.configurations.forEach((configuration) => {

		// Update toolbar label
		currentCMakeConfig.text = configuration.name;

		// Reset targets map

		let map = new Map<string, string>();

		configuration.projects.forEach((project) => {

			if (project.targets) {

				project.targets.forEach((target) => {
					if (target.type === 'EXECUTABLE') {
						// Get the first artifact path for executable targets
						if (target.artifacts && target.artifacts.length > 0) {
							map.set(target.name, target.artifacts[0]);
						}
					}
				});
			}
		});

		targetsMap.set(configuration.name, map);
	});

	//targetsMap.forEach((artifactPath, targetName) => {
	//	print(`${targetName}: ${artifactPath}`, 2);
	//});

	// Update tree view
	// if (treeProvider) {
	// 	treeProvider.updateTargets(executableTargets);
	// }
}

async function updateProjectModel(project: Project): Promise<void> {

	const codemodel: CodeModel.Content | undefined = project.codeModel;

	if (codemodel) {
		updateCMakeCodeModel(codemodel);
	}

	const buildType = await project.getActiveBuildType();
	print(`Active build type: ${buildType}`, 1);
}

async function updateCMakeProject(project: Project): Promise<void> {

	activeProject = project;

	//let sd = activeProject.project._sourceDir;

	await updateProjectModel(activeProject);

	// Subscribe on code model updates

	activeProject.onCodeModelChanged(() => {
		print("onCodeModelChanged received ");
		if (activeProject && activeProject.codeModel) {
			updateCMakeCodeModel(activeProject.codeModel);
		}
	});
}

export async function activate(context: vscode.ExtensionContext) {

	// This method is called when your extension is activated

	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return;
	}

	terminalManager = new TerminalManager();

	// Initialize tree provider
	targetsProvider = new TargetTreeProvider();

	//Create tree view with options
	targetsView = vscode.window.createTreeView('TargetsTreeView', {
		treeDataProvider: targetsProvider,
		showCollapseAll: false,
		canSelectMany: false
	});

	context.subscriptions.push(targetsView);

	await setupCommands(context);
	await setupStatusBar(context);

	const cmakeToolsExtension: CMakeToolsExtensionExports = await vscode.extensions.getExtension('ms-vscode.cmake-tools')?.activate();
	cmake_api = cmakeToolsExtension.getApi(Version.latest);

	const active_project = await cmake_api.getProject(vscode.Uri.file(cmake_api.getActiveFolderPath()));

	if (active_project) {
		await updateCMakeProject(active_project);
	}

	// Subscribe on project changes
	cmake_api.onActiveProjectChanged(async (projectUri) => {

		print("onActiveProjectChanged received");

		let proj;
		if (projectUri) {
			proj = await cmake_api.getProject(projectUri);
		}

		if (proj) {
			await updateCMakeProject(proj);
		}
	});

	// For simplicity, watch only the first workspace folder
	// TODO: support multiple workspaces

	const workspaceFolder = vscode.workspace.workspaceFolders[0];
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder.uri, '.vscode/targets.json'));

	// Subscribe on targets.json changes

	watcher.onDidCreate(uri => updateTargetsModel(uri, workspaceFolder));
	watcher.onDidChange(uri => updateTargetsModel(uri, workspaceFolder));
	watcher.onDidDelete(uri => updateTargetsModel(uri, workspaceFolder));

	context.subscriptions.push(watcher);

	targetsModel = new TargetsModel();
	targetsProvider.setModel(targetsModel);

	await updateTargetsModel(vscode.Uri.joinPath(workspaceFolder.uri, '.vscode/targets.json'), workspaceFolder);

	// Update tree when workspace folders change
	// context.subscriptions.push(
	//   vscode.workspace.onDidChangeWorkspaceFolders(() => {
	//     logInfo('Workspace folders changed, refreshing');
	//     launchProvider.refresh();
	//   })
	// );

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
}

async function setupCommands(context: vscode.ExtensionContext) {

	vscode.commands.registerCommand('targetsLauncher.run', async (node: TargetNode) => {

		try {
			if (node.workspace && node instanceof TargetNode) {

				// Какую конфигурацию запускать???

				let configMap = targetsMap.get(currentCMakeConfig.text);

				if (configMap) {

					let executablePath = configMap.get(node.id);

					if (executablePath) {

						let options: vscode.TerminalOptions = {};

						// Добавить аргумент в имя терминала??
						options.name = node.name;
						options.iconPath = new vscode.ThemeIcon('circle-outline');

						let terminal: vscode.Terminal = terminalManager.getOrCreateTerminal(node, options);

						terminal.sendText(executablePath);
						terminal.show();
					}
				}

				// Start debugging with the selected configuration
				//await vscode.debug.startDebugging(item.workspace, item.configuration);

				// Add to recent items
				///recentItemsManager.addRecentItem(item);
				//launchConfigurationProvider.refresh();

				// Show notification
				//vscode.window.showInformationMessage(`Launched debug configuration: ${item.name}`);
			} else {
				//vscode.window.showErrorMessage('Unable to launch configuration: No workspace folder found');
			}
		} catch (error) {
			//vscode.window.showErrorMessage(`Failed to launch configuration: ${error}`);
		}
	});

	vscode.commands.registerCommand('targetsLauncher.build', async (node: TargetNode) => {

		try {
			activeProject?.build();
		} catch (error) {
			//vscode.window.showErrorMessage(`Failed to launch configuration: ${error}`);
		}
	});
}

async function setupStatusBar(context: vscode.ExtensionContext) {

	{
		// Create Build button

		//const cmd = {} as vscode.Command;
		//cmd.command = 'targetsTreeView.build';
	//	cmd.arguments = ["preset", "release"];

		let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		statusBarItem.text = "$(rocket) Build";
		statusBarItem.tooltip = "Build CMake project";
		statusBarItem.command = 'targetsLauncher.build';
		statusBarItem.name = "Targets (extension)";

	//	await vscode.commands.executeCommand('cmake.build'))

		statusBarItem.show();

		context.subscriptions.push(statusBarItem);
	}

	{
		// Create status bar item

		currentCMakeConfig = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		currentCMakeConfig.tooltip = "Select CMake Configuration";
		currentCMakeConfig.command = "cmake.selectConfigurePreset";

		currentCMakeConfig.show();

		context.subscriptions.push(currentCMakeConfig);
	}

	{
		// Create Run button

		let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		statusBarItem.text = "$(play)";
		statusBarItem.tooltip = "Run";
		//statusBarItem.command = "cmake.selectConfigurePreset";

		statusBarItem.show();

		context.subscriptions.push(statusBarItem);
	}
}

async function updateTargetsModel(targetsUri: vscode.Uri, workspaceFolder: vscode.WorkspaceFolder) {

	await targetsModel.readTargetsModel(targetsUri, workspaceFolder);

	targetsProvider.refresh();
}

// This method is called when your extension is deactivated
export function deactivate() { }
