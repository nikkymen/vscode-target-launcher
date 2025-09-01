import * as vscode from 'vscode';
import { CMakeToolsApi, CMakeToolsExtensionExports, CodeModel, ConfigurationType, Project, Version } from './cmake-api/api';
import { TargetTreeProvider } from './targets-provider';
import { TargetNode, TargetsModel, TreeNode } from './targets-model';
import { TerminalManager } from './terminal-manager';

const targetsChannel = vscode.window.createOutputChannel("Targets Launcher");

let targetsFileUri: vscode.Uri
let extensionContext: vscode.ExtensionContext;
let cmakeApi: CMakeToolsApi;
let activeProject: Project | undefined;
let targetsMap: Map<string, Map<string, string>> = new Map();
let terminalManager: TerminalManager;

let targetsModel: TargetsModel;
let targetsView: vscode.TreeView<TreeNode>;
let targetsProvider: TargetTreeProvider;

let currentTarget: TargetNode | undefined;

let statusTargetItem: vscode.StatusBarItem;
let statusArgsItem: vscode.StatusBarItem;

// https://github.com/microsoft/vscode-cmake-tools-api/tree/main/sample-extension
// https://github.com/arthurvaverko/launch-sidebar-extension
// https://code.visualstudio.com/api/references/icons-in-labels#icon-listing

function print(string: string, numTabs = 0): void
{
	let value = "";

	for (let i = 0; i < numTabs; i++)
		value += "\t";

	targetsChannel.appendLine(`${value}${string}`);
	//logger.show();
}

async function updateCMakeCodeModel(codemodel: CodeModel.Content): Promise<void>
{
	// Collect executable targets

	codemodel.configurations.forEach((configuration) =>
	{
		// Reset targets map

		let map = new Map<string, string>();

		configuration.projects.forEach((project) =>
		{
			if (project.targets)
			{
				project.targets.forEach((target) =>
				{
					if (target.type === 'EXECUTABLE')
					{
						// Get the first artifact path for executable targets
						if (target.artifacts && target.artifacts.length > 0)
							map.set(target.name, target.artifacts[0]);
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

async function updateProjectModel(project: Project): Promise<void>
{
	const codemodel: CodeModel.Content | undefined = project.codeModel;

	if (codemodel)
		updateCMakeCodeModel(codemodel);

	const buildType = await project.getActiveBuildType();
	print(`Active build type: ${buildType}`, 1);
}

async function updateCMakeProject(project: Project): Promise<void>
{
	activeProject = project;

	//let presets = await (activeProject as any).project.presetsController.getAllBuildPresets();

	//let driver = await (activeProject as any).project.getCMakeDriverInstance();
	//let buildRunner = (driver as any).cmakeBuildRunner;

	await updateProjectModel(activeProject);

	// Subscribe on code model updates

	{
		const disposable = (activeProject as any).project.onReconfigured(() =>
		{
			print("onReconfigured received ");

			if (activeProject && activeProject.codeModel)
				updateCMakeCodeModel(activeProject.codeModel);
		});

		extensionContext.subscriptions.push(disposable);
	}
}

export async function activate(context: vscode.ExtensionContext)
{
	extensionContext = context;

	// This method is called when your extension is activated

	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0)
		return;

	terminalManager = new TerminalManager();

	// Initialize tree provider
	targetsProvider = new TargetTreeProvider();

	//Create tree view with options
	targetsView = vscode.window.createTreeView('TargetsTreeView',
	{
		treeDataProvider: targetsProvider,
		showCollapseAll: true,
		canSelectMany: false
	});

	targetsView.onDidChangeSelection((event) =>
	{
		if (event.selection.length == 0)
			return;

		const selectedNode = event.selection[0];

		if (selectedNode instanceof TargetNode)
		{
			currentTarget = selectedNode;

			updateCurrentTarget();
		}
	});

	context.subscriptions.push(targetsView);

	await setupCommands(context);

	const cmakeToolsExtension: CMakeToolsExtensionExports = await vscode.extensions.getExtension('ms-vscode.cmake-tools')?.activate();
	cmakeApi = cmakeToolsExtension.getApi(Version.latest);

	const activeProject = await cmakeApi.getProject(vscode.Uri.file(cmakeApi.getActiveFolderPath()));

	if (activeProject)
		await updateCMakeProject(activeProject);

	// Subscribe on project changes
	cmakeApi.onActiveProjectChanged(async (projectUri) =>
	{
		let proj;

		if (projectUri)
			proj = await cmakeApi.getProject(projectUri);

		if (proj)
			await updateCMakeProject(proj);
	});

	// For simplicity, watch only the first workspace folder
	// TODO: support multiple workspaces

	const workspaceFolder = vscode.workspace.workspaceFolders[0];
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder.uri, '.vscode/targets.json'));

	targetsFileUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode/targets.json')

	// Subscribe on targets.json changes

	watcher.onDidCreate(uri => updateTargetsModel(uri, workspaceFolder));
	watcher.onDidChange(uri => updateTargetsModel(uri, workspaceFolder));
	watcher.onDidDelete(uri => updateTargetsModel(uri, workspaceFolder));

	context.subscriptions.push(watcher);

	targetsModel = new TargetsModel();
	targetsProvider.setModel(targetsModel);

	await setupStatusBar(extensionContext);

	await updateTargetsModel(targetsFileUri, workspaceFolder);
}

async function updateCurrentTarget()
{
	if (!currentTarget)
	{
		statusTargetItem.hide();
		statusArgsItem.hide();

		return;
	}

	statusArgsItem.text = currentTarget.nodeArgs;
	statusArgsItem.show();

	statusTargetItem.text = "$(play) " + currentTarget.name;
	statusTargetItem.show();
}

async function setupCommands(context: vscode.ExtensionContext)
{
	{
		const disposable = vscode.commands.registerCommand('targetsLauncher.editTargets', async () =>
		{
			const doc = await vscode.workspace.openTextDocument(targetsFileUri);
			const editor = await vscode.window.showTextDocument(doc, { preview: false });

			// Create a selection from the start to end positions
			// const startPosition = new vscode.Position(item.position.startLine, item.position.startCharacter);
			// const endPosition = new vscode.Position(item.position.endLine, item.position.endCharacter);
			// const selection = new vscode.Selection(startPosition, startPosition);

			// // Set the selection and reveal the range in the editor
			// editor.selection = selection;
			// editor.revealRange(
			// new vscode.Range(startPosition, endPosition),
			// vscode.TextEditorRevealType.InCenter
			// );
		});

		context.subscriptions.push(disposable);
	}

	{
		const disposable = vscode.commands.registerCommand('targetsLauncher.run', async (node: TargetNode) =>
		{
			if (node.workspace && node instanceof TargetNode)
				runTarget(node);
		});

		context.subscriptions.push(disposable);
	}


	{
		const disposable = vscode.commands.registerCommand('targetsLauncher.runCurrent', async () =>
		{
			if (currentTarget)
				runTarget(currentTarget);
		});

		context.subscriptions.push(disposable);
	}

	{
		// const disposable = vscode.commands.registerCommand(
		// 	"targetsLauncher.editArg",
		// 	async () =>
		// 	{
		// 		if (!currentTarget)
		// 			return;

		// 		const newValue = await vscode.window.showInputBox(
		// 		{
		// 			value: currentTarget.nodeArgs,
		// 			prompt: "Edit argument value",
		// 			placeHolder: "Enter argument value",
		// 		});

		// 		if (newValue !== undefined)
		// 		{
		// 			currentTarget.nodeArgs = newValue;
		// 			targetsProvider.refresh(); // Refresh the tree view
		// 		}
		// 	})

		const disposable = vscode.commands.registerCommand("targetsLauncher.editArgsCurrent", async () =>
		{
			if (currentTarget)
				editTargetArgsDialog(currentTarget)
		})

		context.subscriptions.push(disposable);
	}

	// {
	// 	const disposable = vscode.commands.registerCommand('targetsLauncher.args', async () =>
	// 	{
	// 		//return "'--file=/home/user/my_file.txt' '--value=33'";
	// 		//return "\"--file=/home/user/my_file.txt\"";
	// 		//return "\"--file=/home/user/my file.txt\"";
	// 		return "--file=/home/user/text_file.txt:--value=33";
	// 	});

	// 	context.subscriptions.push(disposable);
	// }
}

async function runTarget(target: TargetNode)
{
	let executablePath = '';

	if (target.launcher == 'cmake')
	{
		let configMap = targetsMap.get('Debug');

		if (configMap)
			executablePath = configMap.get(target.id) || '';
	}
	else if (target.launcher == 'command')
	{
		executablePath = target.id;
	}

	if (executablePath.length > 0)
	{
		let options: vscode.TerminalOptions = {};

		// Добавить аргумент в имя терминала??
		options.name = target.name;
		options.iconPath = new vscode.ThemeIcon('circle-outline');

		let terminal: vscode.Terminal = terminalManager.getTerminal(target, options);

		// Build command with arguments
		let command = executablePath;

		// Add arguments if available
		if (target.args && target.args.length > 0)
		{
			// Map each argument node to its string value and join with spaces
			const argsString = target.args;

			command = `${executablePath} ${argsString}`;
		}

		terminal.sendText(command);
		terminal.show();
	}
}

function editTargetArgsDialog(target: TargetNode)
{
	const inputBox = vscode.window.createInputBox();

	inputBox.value = target.nodeArgs || '';
	inputBox.prompt = "Edit argument value";
	inputBox.placeholder = "Enter argument value";

	// Add button to open launch.json
	inputBox.buttons = [
		{
			iconPath: new vscode.ThemeIcon("json"),
			tooltip: "Open launch.json"
		}
	];

	// Handle button click to open launch.json
	inputBox.onDidTriggerButton(async () =>
	{
		// Get the URI for launch.json
		const launchJsonUri = vscode.Uri.joinPath(
			vscode.workspace.workspaceFolders?.[0].uri || vscode.Uri.file(''),
			'.vscode/launch.json'
		);

		try
		{
			const doc = await vscode.workspace.openTextDocument(launchJsonUri);
			await vscode.window.showTextDocument(doc);
		}
		catch (error)
		{
			vscode.window.showErrorMessage('Could not open launch.json file.');
		}
	});

	// Handle when user presses Enter
	inputBox.onDidAccept(() =>
	{
		target.nodeArgs = inputBox.value;
		targetsProvider.refresh();
		inputBox.hide();

		updateCurrentTarget();
	});

	// Show the input box
	inputBox.show();
}

async function setupStatusBar(context: vscode.ExtensionContext)
{
	const extensionName = 'Targets (extension)';
	const config = vscode.workspace.getConfiguration('targetsLauncher');
	let priority = config.get('statusBarItemsPriority', -97);

	{
		statusTargetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
		statusTargetItem.text = " "
		statusTargetItem.name = extensionName;
		statusTargetItem.command = "targetsLauncher.runCurrent";

		context.subscriptions.push(statusTargetItem);

		priority--;
	}

	{
		statusArgsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
		statusArgsItem.name = extensionName;
		statusArgsItem.text = " "
		statusArgsItem.command = "targetsLauncher.editArgsCurrent"

		context.subscriptions.push(statusArgsItem);

		priority--;
	}
}

async function updateTargetsModel(targetsUri: vscode.Uri, workspaceFolder: vscode.WorkspaceFolder)
{
	await targetsModel.readTargetsModel(targetsUri, workspaceFolder);

	targetsProvider.refresh();

	if (targetsModel.firstTarget && (targetsView.selection.length == 0))
	{
		// Select first target in view

		await targetsView.reveal(targetsModel.firstTarget, { select: true, focus: true });
	}

	updateCurrentTarget();
}

// This method is called when your extension is deactivated
export function deactivate() { }
