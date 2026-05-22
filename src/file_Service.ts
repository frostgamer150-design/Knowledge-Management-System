import type { ExplorerNode } from './types';

// @ts-ignore
const electronAPI = window.electron;

export const fileService = {
    async getVaultTree(): Promise<ExplorerNode[]> {
        try {
            return await electronAPI.getVaultTree();
        } catch (error) {
            console.error('Failed to get vault tree:', error);
            return [];
        }
    },

    async createFile(relativePath: string, content = ''): Promise<void> {
        try {
            await electronAPI.createFile(relativePath, content);
        } catch (error) {
            console.error('Failed to create file:', error);
            throw error;
        }
    },

    async createFolder(relativePath: string): Promise<void> {
        try {
            await electronAPI.createFolder(relativePath);
        } catch (error) {
            console.error('Failed to create folder:', error);
            throw error;
        }
    },

    async readFile(relativePath: string): Promise<string> {
        try {
            return await electronAPI.readFile(relativePath);
        } catch (error) {
            console.error('Failed to read file:', error);
            return '';
        }
    },

    async writeFile(relativePath: string, content: string): Promise<void> {
        try {
            await electronAPI.writeFile(relativePath, content);
        } catch (error) {
            console.error('Failed to write file:', error);
            throw error;
        }
    },

    async moveItem(oldRelativePath: string, newRelativePath: string): Promise<{ success: boolean; error?: string }> {
        try {
            return await electronAPI.moveItem(oldRelativePath, newRelativePath);
        } catch (error) {
            console.error('Failed to move item:', error);
            return { success: false, error: String(error) };
        }
    },

    async deleteItem(relativePath: string): Promise<{ success: boolean; error?: string }> {
        try {
            return await electronAPI.deleteItem(relativePath);
        } catch (error) {
            console.error('Failed to delete item:', error);
            return { success: false, error: String(error) };
        }
    }
};
