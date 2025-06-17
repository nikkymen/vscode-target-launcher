import * as vscode from 'vscode';
import { TreeNode } from './targets-model';

/**
 * Terminal manager to track and reuse terminals
 */
export class TerminalManager {
    private terminals: Map<TreeNode, vscode.Terminal> = new Map();

    /**
     * Get or create a terminal for a specific task
     * @param name The name of the terminal
     * @param cwd The working directory for the terminal
     * @returns A terminal instance (either existing or new)
     */
    public getOrCreateTerminal(node: TreeNode, options: vscode.TerminalOptions): vscode.Terminal {
        // Create a unique key for this terminal based on name and working directory

        // Check if we already have this terminal
        if (this.terminals.has(node)) {
            const terminal = this.terminals.get(node);

            // Verify the terminal still exists (not closed by user)
            if (terminal && this.isTerminalStillAlive(terminal)) {
                return terminal;
            }
        }

        // Create a new terminal
        const terminal = vscode.window.createTerminal(options);

        // Store it for future reuse
        this.terminals.set(node, terminal);

        return terminal;
    }

    /**
     * Check if a terminal is still alive (not disposed)
     */
    private isTerminalStillAlive(terminal: vscode.Terminal): boolean {
        // Get current terminals from vscode
        const activeTerminals = vscode.window.terminals;

        // Check if our terminal is still in the list
        return activeTerminals.includes(terminal);
    }

    /**
     * Remove disposed terminals from the tracking
     */
    public cleanupTerminals(): void {
        // Create a new map with only the active terminals
        const newMap = new Map<TreeNode, vscode.Terminal>();

        for (const [key, terminal] of this.terminals.entries()) {
            if (this.isTerminalStillAlive(terminal)) {
                newMap.set(key, terminal);
            }
        }

        this.terminals = newMap;
    }
}