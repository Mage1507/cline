import type { SecretStorage as VSCodeSecretStorage } from "vscode"
import { ClineStorage } from "./ClineStorage"

type SecretStores = VSCodeSecretStorage | ClineStorage

/**
 * Wrapper around VSCode Secret Storage or any other storage type for managing secrets.
 */
export class ClineSecretStorage extends ClineStorage {
	private static readonly store = new ClineSecretStorage()
	static get instance(): ClineSecretStorage {
		return ClineSecretStorage.store
	}

	private secretStorage: SecretStores | null = null

	public get storage(): SecretStores {
		if (!this.secretStorage) {
			throw new Error("[ClineSecretStorage] init not called")
		}
		return this.secretStorage
	}

	public init(store: SecretStores) {
		if (!this.secretStorage) {
			this.secretStorage = store
			console.info("[ClineSecretStorage] initialized")
		}
		return this.secretStorage
	}

	protected async _get(key: string): Promise<string | undefined> {
		try {
			return key ? await this.storage.get(key) : undefined
		} catch (error) {
			console.error("[ClineSecretStorage]", error)
			return undefined
		}
	}

	/**
	 * [SECURITY] Avoid logging secrets values.
	 */
	protected async _store(key: string, value: string): Promise<void> {
		try {
			if (value && value.length > 0) {
				await this.storage.store(key, value)
			}
		} catch (error) {
			console.error("[ClineSecretStorage]", error)
		}
	}

	protected async _delete(key: string): Promise<void> {
		console.info("[ClineSecretStorage]", "deleting", key)
		await this.storage.delete(key)
	}
}

/**
 * Singleton instance of ClineSecretStorage
 */
export const secretStorage = ClineSecretStorage.instance
