import * as vscode from 'vscode';
import { TargetNode } from './targets-model';

export class TerminalManager
{
    private terminals: Map<TargetNode, vscode.Terminal> = new Map();

    constructor()
    {
        // Следить за состоянием терминалов и обновлять кнопки

        vscode.window.onDidChangeTerminalState((event) => {
            let t = 99;
        });
    }

    public getTerminal(node: TargetNode, options: vscode.TerminalOptions): vscode.Terminal
    {
        if (this.terminals.has(node))
        {
            const terminal = this.terminals.get(node);

            if (terminal && this.isTerminalStillAlive(terminal))
                return terminal;
        }

        const terminal = vscode.window.createTerminal(options);

        this.terminals.set(node, terminal);

        return terminal;
    }

    private isTerminalStillAlive(terminal: vscode.Terminal): boolean
    {
        return vscode.window.terminals.includes(terminal);
    }

    /**
     * Remove disposed terminals from the tracking
     */
    public cleanupTerminals(): void
    {
        // Create a new map with only the active terminals
        const newMap = new Map<TargetNode, vscode.Terminal>();

        for (const [key, terminal] of this.terminals.entries())
        {
            if (this.isTerminalStillAlive(terminal))
                newMap.set(key, terminal);
        }

        this.terminals = newMap;
    }
}