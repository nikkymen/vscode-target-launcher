import * as vscode from 'vscode';
import { TargetsModel, TreeNode, TargetNode, GroupNode, RunConfigNode } from './targets-model';

export class TargetTreeProvider implements vscode.TreeDataProvider<TreeNode>
{
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    public runConfigNode: RunConfigNode = new RunConfigNode();

    private model: TargetsModel | null = null;

    constructor() {
        this.runConfigNode.name = 'Debug';
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setModel(model: TargetsModel | null): void {
        this.model = model;
    }

    getTreeItem(element: TreeNode): vscode.TreeItem
    {
        if (element instanceof GroupNode)
        {
            return this.createGroupTreeItem(element);
        }
        else if (element instanceof TargetNode)
        {
            return this.createTargetTreeItem(element);
        }
        else if (element instanceof RunConfigNode)
        {
            let item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);

            item.contextValue = 'config';
            item.description = '(Run Configuration)';
            item.iconPath = new vscode.ThemeIcon('terminal');

            return item;
        }
        // else if (element instanceof ArgsNode)
        // {
        //     let item = new vscode.TreeItem("--uri=fdsfjksdfjkd", vscode.TreeItemCollapsibleState.None);

        //     // Set contextValue to identify it as an editable argument
        //     item.contextValue = 'arg';

        //     // Add an icon to indicate it's editable
        //     item.iconPath = new vscode.ThemeIcon('edit');

        //    // item.label
        //     // Make it editable on click
        //     item.command = {
        //         command: 'targetsLauncher.editArg',
        //         title: 'Edit Argument',
        //         arguments: [element]
        //     };

        //  //   item.contextValue = 'config';
        // //    item.description = '(Run Configuration)';
        //   //  item.iconPath = new vscode.ThemeIcon('terminal');

        //     return item;
        // }

        throw new Error('Unknown tree node type');
    }

    private createGroupTreeItem(group: GroupNode): vscode.TreeItem
    {
        const item = new vscode.TreeItem(
            group.name,
            vscode.TreeItemCollapsibleState.Expanded
        );

        item.contextValue = 'group';
        item.iconPath = new vscode.ThemeIcon('folder');
        item.description = group.nodeArgs;

        // Add tooltip with environment and args info if available
        const tooltipParts: string[] = [];

        if (group.args_tooltip)
            tooltipParts.push(`Args: ${group.args_tooltip}`);

        if (group.env_tooltip)
            tooltipParts.push(`Env: ${group.env_tooltip}`);

        if (tooltipParts.length > 0)
            item.tooltip = tooltipParts.join('\n');

        return item;
    }

    private createTargetTreeItem(target: TargetNode): vscode.TreeItem
    {
        const item = new vscode.TreeItem(
            target.name,
            vscode.TreeItemCollapsibleState.None
        );

        item.contextValue = 'target';
        item.iconPath = new vscode.ThemeIcon('circle-outline');
        item.description = target.nodeArgs;

        // Add command to execute the target when clicked
        // item.command = {
        //     command: 'cmake-launcher.runTarget',
        //     title: 'Run Target',
        //     arguments: [target]
        // };

        // Create detailed tooltip
        const tooltipParts: string[] = [`Target: ${target.name}`];

        if (target.id)
            tooltipParts.push(`ID: ${target.id}`);

        if (target.args && target.args.trim())
            tooltipParts.push(`Args: ${target.args}`);

        if (target.env && target.env.size > 0)
        {
            const envEntries = Array.from(target.env.entries())
                .map(([key, value]) => `${key}=${value}`)
                .join(', ');

            tooltipParts.push(`Env: ${envEntries}`);
        }

        item.tooltip = tooltipParts.join('\n');

        return item;
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]>
    {
        let nodes: TreeNode[] = [];

        if (this.model)
        {
            if (!element)
            {
                // We are starting from root nodes

                if (this.model.workspaces.size === 1)
                {
                    // We have single workspace
                    nodes = Array.from(this.model.workspaces.values().next().value?.children || []);
                }
                else
                {
                    nodes = Array.from(this.model.workspaces.values());
                }

                nodes.unshift(this.runConfigNode);
            }
            else if (element instanceof GroupNode)
            {
                nodes = element.children;
            }
            // else if (element instanceof TargetNode)
            // {
            //     nodes = element.args_nodes;
            // }
        }

        return Promise.resolve(nodes.filter(node => node.visible));
    }

    getParent(element: TreeNode): vscode.ProviderResult<TreeNode>
    {
        // This would require maintaining parent references in the model
        // For now, return undefined (not implementing parent navigation)
        return undefined;
    }
}