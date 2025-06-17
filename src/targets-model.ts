import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

export abstract class TreeNode {
    name: string = '?';
    args_tooltip: string | undefined;
    env_tooltip: string | undefined;
    visible: boolean = true;

    constructor() { }
}

export class TargetNode extends TreeNode {
    id: string = '?';
    args: string = '';
    env: Map<string, string> = new Map();
    workspace?: vscode.WorkspaceFolder;
    cwd: string = '.';
    
    constructor() {
        super();
    }
}

export class RunConfigNode extends TreeNode {
    constructor() {
        super();
    }
}

export class GroupNode extends TreeNode {
    children: TreeNode[] = [];

    constructor() {
        super();
    }
}

export class TargetsModel {
    debugger?: { type: string };
    variables?: Map<string, string>;
    env?: Map<string, string>;
    workspaces: Map<string, GroupNode> = new Map();

    constructor() { }

    mergeArgs(parentArgs: string, childArgs: string): string {
        const parts: string[] = [];

        if (parentArgs.trim()) {
            parts.push(parentArgs.trim());
        }

        if (childArgs.trim()) {
            parts.push(childArgs.trim());
        }

        return parts.join(" ");
    }

    mergeEnv(
        parentEnv: Map<string, string>,
        childEnv: Map<string, string>
    ): Map<string, string> {
        const result = new Map(parentEnv);
        for (const [key, value] of childEnv) {
            result.set(key, value);
        }
        return result;
    }

    async readTargetsModel(jsonPath: vscode.Uri, workspace: vscode.WorkspaceFolder) {
        try {

            const targetsDoc = await vscode.workspace.openTextDocument(jsonPath);
            const targetsText = targetsDoc.getText();

            let targetsContent: any;
            try {
                targetsContent = jsonc.parse(targetsText);
            } catch (parseErr) {
                vscode.window.showErrorMessage(
                    `Failed to parse targets.json: ${(parseErr as Error).message}`
                );
                return null;
            }

            this.debugger = targetsContent.debugger;
            this.variables = this.objectToMap(targetsContent.variables || {});

            // Extract top-level configuration and convert to Maps
            this.env = this.objectToMap(targetsContent.env || {});
            const globalArgs = targetsContent.args || "";

            let group = new GroupNode();

            group.name = workspace.name;

            group.children = this.parseTargetsArray(
                targetsContent.targets || [],
                globalArgs,
                this.env,
                workspace
            );

            this.workspaces.set(workspace.uri.toString(), group);

        } catch (err) {
            console.error('Error reading targets model:', err);
            vscode.window.showErrorMessage(
                `Failed to read targets.json: ${(err as Error).message}`
            );
        }
    }

    parseTargetsArray(
        targets_def: any[],
        parentArgs: string = "",
        parentEnv: Map<string, string> = new Map(),
        workspace: vscode.WorkspaceFolder
    ): TreeNode[] {
        const result: TreeNode[] = [];

        for (const target_def of targets_def) {

            let node: TreeNode | null;

            if (target_def.targets_group) {
                // This is a group with child targets
                node = this.parseTargetsGroup(target_def, parentArgs, parentEnv, workspace);
            } else if (target_def.args_group) {
                // This is a target with multiple argument variations
                node = this.parseArgsGroup(target_def, parentArgs, parentEnv, workspace);
            } else {
                // This is a regular target
                node = this.parseTarget(target_def, parentArgs, parentEnv, workspace);
            }

            if (node) {

                const visible = target_def.visible;
                if (visible !== undefined) {
                    node.visible = visible;
                }

                result.push(node);
            }
        }

        return result;
    }

    parseTargetsGroup(
        groupDef: any,
        parentArgs: string,
        parentEnv: Map<string, string>,
        workspace: vscode.WorkspaceFolder
    ): GroupNode {

        const groupArgs = this.mergeArgs(parentArgs, groupDef.args || "");
        const groupEnv = this.mergeEnv(parentEnv, this.objectToMap(groupDef.env || {}));

        let node = new GroupNode();

        node.children = this.parseTargetsArray(groupDef.targets_group, groupArgs, groupEnv, workspace);

        const name = groupDef.name;

        if (name !== undefined) {
            node.name = name;
        }
        else {
            node.name = '?????';
        }

        return node;
    }

    parseArgsGroup(
        targetDef: any,
        parentArgs: string,
        parentEnv: Map<string, string>,
        workspace: vscode.WorkspaceFolder
    ): GroupNode {
        const baseArgs = this.mergeArgs(parentArgs, targetDef.args || "");
        const baseEnv = this.mergeEnv(parentEnv, this.objectToMap(targetDef.env || {}));

        const children: TargetNode[] = [];

        for (const argVariation of targetDef.args_group) {
            const finalArgs = this.mergeArgs(baseArgs, argVariation);

            let node = new TargetNode();

            node.id = targetDef.id;
            node.name = targetDef.id;
            node.args = finalArgs;
            node.env = baseEnv;
            node.workspace = workspace;

            children.push(node);
        }

        let node = new GroupNode();

        node.children = children;
        
        const name = targetDef.name;

        if (name !== undefined) {
            node.name = name;
        }
        else {
            node.name = '?????';
        }

        return node;
    }

    parseTarget(
        targetDef: any,
        parentArgs: string,
        parentEnv: Map<string, string>,
        workspace: vscode.WorkspaceFolder
    ): TargetNode | null {

        let node = new TargetNode();

        node.id = targetDef.id;
        node.workspace = workspace;

        const name = targetDef.name;

        if (name !== undefined) {
            node.name = name;
        }
        else {
            node.name = node.id;
        }

        node.args = this.mergeArgs(parentArgs, targetDef.args || "");
        node.env = this.mergeEnv(parentEnv, this.objectToMap(targetDef.env || {}));

        return node;
    }

    objectToMap(obj: { [key: string]: string }): Map<string, string> {
        return new Map(Object.entries(obj));
    }

    mapToObject(map: Map<string, string>): { [key: string]: string } {
        return Object.fromEntries(map);
    }
}