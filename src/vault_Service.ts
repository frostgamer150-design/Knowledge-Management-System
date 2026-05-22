import type { VaultInfo } from './types';

// @ts-ignore
const electronAPI = window.electron;

export const vaultService = {
  async getVaultInfo(): Promise<VaultInfo> {
    try {
      return await electronAPI.getVaultInfo();
    } catch (error) {
      console.error('Failed to get vault info:', error);
      throw error;
    }
  },

  async selectVaultDir(): Promise<string | null> {
    try {
      return await electronAPI.selectVaultDir();
    } catch (error) {
      console.error('Failed to select vault directory:', error);
      return null;
    }
  },

  async setVaultPath(newPath: string): Promise<void> {
    try {
      await electronAPI.setVaultPath(newPath);
    } catch (error) {
      console.error('Failed to set vault path:', error);
      throw error;
    }
  }
};
