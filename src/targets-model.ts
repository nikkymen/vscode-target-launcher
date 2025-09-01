import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';

/**
 * Interface to track position of a configuration in a document
 * Used for navigating to the exact position of a configuration when editing
 */
export interface ConfigPosition
{
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
}

export abstract class TreeNode
{
    name: string = '?';
    visible: boolean = true;
    position: ConfigPosition | undefined;

    constructor() { }
}

export abstract class ExecutabeNode extends TreeNode
{
    args_tooltip: string | undefined;
    env_tooltip: string | undefined;
    nodeArgs: string = '';

    constructor()
    {
        super();
    }
}

export class TargetNode extends ExecutabeNode
{
    id: string = '?';
    launcher: string = 'cmake';
    args: string = '';
    env: Map<string, string> = new Map();
    workspace?: vscode.WorkspaceFolder;
    cwd: string = '.';

    arguments(): string
    {
        return this.nodeArgs + this.args;
    }

    constructor()
    {
        super();
    }
}

export class GroupNode extends ExecutabeNode
{
    children: TreeNode[] = [];

    constructor()
    {
        super();
    }
}

export class RunConfigNode extends TreeNode
{
    constructor()
    {
        super();
    }
}

export class TargetsModel
{
    firstTarget?: TargetNode;
    debugger?: { type: string };
    variables?: Map<string, string>;
    env?: Map<string, string>;
    workspaces: Map<string, GroupNode> = new Map();

    constructor() { }

    mergeArgs(parentArgs: string, childArgs: string): string
    {
        const parts: string[] = [];

        if (parentArgs.trim())
            parts.push(parentArgs.trim());

        if (childArgs.trim())
            parts.push(childArgs.trim());

        return parts.join(" ");
    }

    mergeEnv(parentEnv: Map<string, string>, childEnv: Map<string, string>): Map<string, string>
    {
        const result = new Map(parentEnv);

        for (const [key, value] of childEnv)
            result.set(key, value);

        return result;
    }

    async readTargetsModel(jsonPath: vscode.Uri, workspace: vscode.WorkspaceFolder)
    {
        try
        {
            const targetsDoc = await vscode.workspace.openTextDocument(jsonPath);
            const targetsText = targetsDoc.getText();

            // Use VS Code's built-in JSON parser that supports comments and trailing commas
            const document = await vscode.workspace.openTextDocument(jsonPath);

            let targetsContent: any;
            let rootTree: any;

            try
            {
                targetsContent = jsonc.parse(targetsText);
                rootTree = jsonc.parseTree(targetsText);
            }
            catch (parseErr)
            {
                vscode.window.showErrorMessage(`Failed to parse targets.json: ${(parseErr as Error).message}`);
                return null;
            }

            const targetsNode = jsonc.findNodeAtLocation(rootTree, ['targets']);
            const targetsArray = (targetsNode ? jsonc.getNodeValue(targetsNode) : []) as any[];

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
        }
        catch (err)
        {
            console.error('Error reading targets model:', err);
            vscode.window.showErrorMessage(
                `Failed to read targets.json: ${(err as Error).message}`
            );
        }
    }

    parseTargetsArray(
        targetsDef: any[],
        parentArgs: string = "",
        parentEnv: Map<string, string> = new Map(),
        workspace: vscode.WorkspaceFolder
    ): TreeNode[]
    {
        const result: TreeNode[] = [];

        for (const targetDef of targetsDef)
        {
            let node: TreeNode | null;

            if (targetDef.targets_group)
            {
                // This is a group with child targets
                node = this.parseTargetsGroup(targetDef, parentArgs, parentEnv, workspace);
            }
            else if (targetDef.args_group)
            {
                // This is a target with multiple argument variations
                node = this.parseArgsGroup(targetDef, parentArgs, parentEnv, workspace);
            }
            else
            {
                // This is a regular target
                node = this.createTargetNode(targetDef, parentArgs, parentEnv, workspace);
            }

            if (node)
            {
                const visible = targetDef.visible;

                if (visible !== undefined)
                    node.visible = visible;

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

        node.nodeArgs = groupDef.args;
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
        groupDef: any,
        parentArgs: string,
        parentEnv: Map<string, string>,
        workspace: vscode.WorkspaceFolder
    ): GroupNode
    {
        const groupArgs = this.mergeArgs(parentArgs, groupDef.args || "");
        const groupEnv = this.mergeEnv(parentEnv, this.objectToMap(groupDef.env || {}));

        const children: TargetNode[] = [];

        for (const nodeArgs of groupDef.args_group)
        {
            let targetDef = structuredClone(groupDef);

            targetDef.args = nodeArgs;
            targetDef.name = targetDef.id;

            children.push(this.createTargetNode(targetDef, groupArgs, groupEnv, workspace));

            // let node = new TargetNode();

            // node.id = targetDef.id;
            // node.name = targetDef.id;
            // node.nodeArgs = nodeArgs;
            // node.args = args;
            // node.env = baseEnv;
            // node.workspace = workspace;
        }

        let node = new GroupNode();

        node.nodeArgs = groupDef.args;
        node.children = children;

        const name = groupDef.name;

        if (name !== undefined)
            node.name = name;
        else
            node.name = '?????';

        return node;
    }

    createTargetNode(
        targetDef: any,
        parentArgs: string,
        parentEnv: Map<string, string>,
        workspace: vscode.WorkspaceFolder
    ): TargetNode
    {
        let node = new TargetNode();

        node.id = targetDef.id;
        node.workspace = workspace;

        const launcher = targetDef.launcher;

        if (launcher != undefined)
            node.launcher = launcher;

        const name = targetDef.name;

        if (name != undefined)
            node.name = name;
        else
            node.name = node.id;

        node.nodeArgs = targetDef.args;
        node.args = this.mergeArgs(parentArgs, targetDef.args || "");
        node.env = this.mergeEnv(parentEnv, this.objectToMap(targetDef.env || {}));

        if (!this.firstTarget)
            this.firstTarget = node;

        return node;
    }

    objectToMap(obj: { [key: string]: string }): Map<string, string>
    {
        return new Map(Object.entries(obj));
    }

    mapToObject(map: Map<string, string>): { [key: string]: string }
    {
        return Object.fromEntries(map);
    }
}