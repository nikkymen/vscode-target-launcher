import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { CMakeToolsApi, CMakeToolsExtensionExports, CodeModel, ConfigurationType, Project, Version } from 'vscode-cmake-tools';

const logger = vscode.window.createOutputChannel("target-launcher extension");

// https://github.com/microsoft/vscode-cmake-tools-api/tree/main/sample-extension
// https://github.com/arthurvaverko/launch-sidebar-extension

function print(string: string, numTabs = 0): void {
	let value = "";
	for (let i = 0; i < numTabs; i++) {
		value += "\t";
	}
	logger.appendLine(`${value}${string}`);
	logger.show();
}

function printCodeModelContent(codemodel: CodeModel.Content): void {
	print(`Printing the current codemodel from the project using`, 1);

	print("Printing out the toolchains from the codemodel", 2);
	codemodel.toolchains?.forEach((toolchain) => {
		print(`Path: ${toolchain.path}`, 3);
		if (toolchain.target) {
			print(`Target: ${toolchain.target}`, 3);
		}
	});

	print("Printing out the configurations from the codemodel", 2);
	codemodel.configurations.forEach((configuration) => {
		print(`Name: ${configuration.name}`, 3);
		print("Printing out the projects for the configuration", 4);
		configuration.projects.forEach((project) => {
			print(`Name: ${project.name}`, 5);
			print(`Source Directory: ${project.sourceDirectory}`, 5);
			if (project.targets) {
				print("Printing out the targets for the project", 5);
				project.targets.forEach((target) => {
					print(`Name: ${target.name}`, 6);
					print(`Type: ${target.type}`, 7);

					if (target.sourceDirectory) {
						print(`Source Directory: ${target.sourceDirectory}`, 7);
					}

					if (target.fullName) {
						print(`Full Name: ${target.fullName}`, 7);
					}

					if (target.sysroot) {
						print(`Sysroot: ${target.sysroot}`, 7);
					}

					if (target.artifacts) {
						print("Printing out the artifacts for the target", 7);
						target.artifacts.forEach((artifact) => {
							print(`Artifact: ${artifact}`, 8);
						});
					}

					if (target.fileGroups) {
						print("Printing out the file groups for the target", 7);
						target.fileGroups.forEach((fileGroup) => {
							print("Filegroup:", 8);
							print("Printing our the sources for the filegroup", 9);
							fileGroup.sources.forEach((source) => {
								print(`Source: ${source}`, 10);
							});

							if (fileGroup.language) {
								print(`Language: ${fileGroup.language}`, 9);
							}

							if (fileGroup.includePath) {
								print("Printing out the include paths for the filegroup", 9);
								fileGroup.includePath.forEach((includePath) => {
									print(`Include Path: ${includePath.path}`, 10);
								});
							}

							if (fileGroup.compileCommandFragments) {
								print("Printing out the compile command fragments for the filegroup", 9);
								fileGroup.compileCommandFragments.forEach((compileCommandFragment) => {
									print(`Compile Command Fragment: ${compileCommandFragment}`, 10);
								});
							}

							if (fileGroup.defines) {
								print("Printing out the defines for the filegroup", 9);
								fileGroup.defines.forEach((define) => {
									print(`Define: ${define}`, 10);
								});
							}

							if (fileGroup.isGenerated) {
								print("Filegroup is generated", 9);
							} else {
								print("Filegroup is not generated", 9);
							}
						});
					}
				});
			}

			if (project.hasInstallRule) {
				print("Project has install rule", 5);
			} else {
				print("Project does not have install rule", 5);
			}
		});
	});

	print("Done printing out the codemodel content", 1);
}

async function printProjectDetails(project: Project): Promise<void> {
	print("Printing out the project details using the cmake-tools-api\n");

	const codemodel: CodeModel.Content | undefined = project.codeModel;
	if (codemodel) {
		printCodeModelContent(codemodel);
	}

	const buildType = await project.getActiveBuildType();
	print(`Active build type: ${buildType}`, 1);

	const buildDirectory = await project.getBuildDirectory();
	print(`Build directory: ${buildDirectory}`, 1);

	// Other methods available on the project object.
	//await activeProject.build();
	//await activeProject.clean();
	//await activeProject.configure();
	//await activeProject.install();
	//await activeProject.reconfigure();

	print("\nDone printing project details");
}

async function updateProject(project: Project): Promise<void> {
	activeProject = project;
	await printProjectDetails(activeProject);

	activeProject.onCodeModelChanged((_) => {
		print("Code model changed event received");
		if (activeProject && activeProject.codeModel) {
			printCodeModelContent(activeProject.codeModel);
		}
	});

	activeProject.onSelectedConfigurationChanged((configuration) => {
		print("Selected configuration changed event received");
		switch (configuration) {
			case ConfigurationType.Kit:
				print("Selected configuration type: Kit");
				break;
			case ConfigurationType.ConfigurePreset:
				print("Selected configuration type: Configure Preset");
				break;
			case ConfigurationType.BuildPreset:
				print("Selected configuration type: Build Preset");
				break;
		}
	});
}

let api: CMakeToolsApi;
let activeProject: Project | undefined;

export async function activate(context: vscode.ExtensionContext) {

	// This method is called when your extension is activated
	// Your extension is activated the very first time the command is executed

	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return;
	}

	const cmakeToolsExtension: CMakeToolsExtensionExports = await vscode.extensions.getExtension('ms-vscode.cmake-tools')?.activate();
	api = cmakeToolsExtension.getApi(Version.v3);

	// Other items available on the api object.
	const version = api.version;
	print(`CMake Tools API version: ${version}`);
	//api.showUIElement(<element>);
	//api.hideUIElement(<element>);

	const proj = await api.getProject(vscode.Uri.file(api.getActiveFolderPath()));
	if (proj) {
		await updateProject(proj);
	}

	api.onBuildTargetChanged(async (target) => {
		print("Build target changed event received");
		print(`Build target: ${target}`);
	});

	api.onLaunchTargetChanged(async (target) => {
		print("Launch target changed event received");
		print(`Launch target: ${target}`);
	});

	api.onActiveProjectChanged(async (projectUri) => {
		logger.clear();
		print("Active project changed event received");
		let proj;
		if (projectUri) {
			proj = await api.getProject(projectUri);
		}

		if (proj) {
			await updateProject(proj);
		}
	});
	
	//activeProject = await api.getProject(vscode.Uri.file(api.getActiveFolderPath()));


	//artifacts = activeProject?.codeModel?.configurations[0].projects[0].targets[0].artifacts;

	//targets = activeProject?.codeModel?.configurations;
	
	// For simplicity, watch only the first workspace folder:
	const rootFolder = vscode.workspace.workspaceFolders[0].uri;
	const targetsPattern = new vscode.RelativePattern(rootFolder, '.vscode/targets.json');
	const watcher = vscode.workspace.createFileSystemWatcher(targetsPattern);

	// Whenever targets.json is created or changed, update launch.json
	watcher.onDidCreate(uri => updateLaunchJson(uri, rootFolder));
	watcher.onDidChange(uri => updateLaunchJson(uri, rootFolder));
	watcher.onDidDelete(uri => updateLaunchJson(uri, rootFolder));

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
