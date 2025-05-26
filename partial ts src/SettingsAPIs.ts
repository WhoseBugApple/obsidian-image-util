import {PluginAPIs} from "./PluginAPIs";
import {PluginSettings} from "./PluginSettings";

export class SetSaveResult<ValueType> {
	public readonly updated: boolean;
	public readonly useCurrent: boolean;
	public readonly useSuggestLike: boolean;
	public readonly useDefault: boolean;
	public readonly finalValue: ValueType;

	constructor(updated: boolean, useCurrent: boolean, useSuggestLike: boolean, useDefault: boolean, finalValue: ValueType) {
		this.updated = updated;
		this.useCurrent = useCurrent;
		this.useSuggestLike = useSuggestLike;
		this.useDefault = useDefault;
		this.finalValue = finalValue;
	}
}

export class SettingsAPIs {
	private readonly pluginAPIs: PluginAPIs;

	constructor(pluginAPIs: PluginAPIs) {
		this.pluginAPIs = pluginAPIs;
	}

	getSettings(): PluginSettings {
		return this.pluginAPIs.plugin.settings;
	}

	getCompressAndRenameImageWhenPaste(): boolean {
		return this.getSettings().compressAndRenameImageWhenPaste;
	}

	async setSaveCompressAndRenameImageWhenPaste_async(value: boolean): Promise<void> {
		if (this.getSettings().compressAndRenameImageWhenPaste != value) {
			this.getSettings().compressAndRenameImageWhenPaste = value;
			await this.saveSettings_async();
		}
	}

	getReadonlyMark(): string {
		return this.getSettings().readonlyMark;
	}

	async setSaveReadonlyMark_async(suggestValue: string): Promise<void> {
		const validVal = suggestValue.toLowerCase();
		if (this.getSettings().readonlyMark != validVal) {
			this.getSettings().readonlyMark = validVal;
			await this.saveSettings_async();
		}
	}

	isReadonly(path: string): boolean {
		return path.toLowerCase().contains(this.getReadonlyMark());
	}

	private getImageDirectoryName_OSView(): string {
		return this.getSettings().imageDirectoryName_OSView;
	}

	tryGetValidImageDirectoryName_OSView(): string | null | Error {
		try {
			let curVal = this.getImageDirectoryName_OSView();
			if (!this.isValidImageDirectoryName_OSView(curVal)) return null;
			return curVal;
		} catch (e) {
			return e;
		}
	}

	validImageDirectoryName_OSView_TextTable(): string {
		return this.pluginAPIs.sharedAPIs.obsidianAPIs.validResourceDirectoryName_OSView_TextTable();
	}

	isValidImageDirectoryName_OSView_SettingValue(value: string): boolean {
		if (value.length == 0) return true;
		return this.isValidImageDirectoryName_OSView(value);
	}

	isValidImageDirectoryName_OSView(value: string): boolean {
		return this.pluginAPIs.sharedAPIs.obsidianAPIs.isValidResourceDirectoryName_OSView(value);
	}

	isValidImageDirectoryName_OSView2(): boolean {
		return this.isValidImageDirectoryName_OSView(this.getImageDirectoryName_OSView());
	}

	async setSaveImageDirectoryName_OSView_async(suggestValue: string): Promise<SetSaveResult<string>> {
		const suggestValueLike = this.pluginAPIs.sharedAPIs.obsidianAPIs.normalizeResourceDirectoryPath_OSView(suggestValue);
		if (this.isValidImageDirectoryName_OSView_SettingValue(suggestValueLike)) {
			const validVal = suggestValueLike;
			if (this.getSettings().imageDirectoryName_OSView != validVal) {
				this.getSettings().imageDirectoryName_OSView = validVal;
				await this.saveSettings_async();
				return new SetSaveResult<string>(true, false, true, false, validVal);
			}
			return new SetSaveResult(false, false, true, false, validVal);
		} else {
			const currentValue = this.getImageDirectoryName_OSView();
			if (this.isValidImageDirectoryName_OSView_SettingValue(currentValue)) {
				return new SetSaveResult<string>(false, true, false, false, currentValue);
			} else {
				const defaultValue = this.getDefaultSettings().imageDirectoryName_OSView;
				this.getSettings().imageDirectoryName_OSView = defaultValue;
				await this.saveSettings_async();
				return new SetSaveResult<string>(true, false, false, true, defaultValue);
			}
		}
	}

	private async setSaveImageDirectoryName_toValue_OSView_async(value: string): Promise<void> {
		if (this.getSettings().imageDirectoryName_OSView != value) {
			this.getSettings().imageDirectoryName_OSView = value;
			await this.saveSettings_async();
		}
	}

	private getExecutableDirectoryRelativePath_OSView(): string {
		return this.getSettings().executableDirectoryRelativePath_OSView;
	}

	tryGetValidExecutableDirectoryRelativePath_OSView(): string | null | Error {
		try {
			let curVal = this.getExecutableDirectoryRelativePath_OSView();
			if (!this.isValidExecutableDirectoryRelativePath_OSView(curVal)) return null;
			return curVal;
		} catch (e) {
			return e;
		}
	}

	validExecutableDirectoryRelativePath_OSView_TextTable(): string {
		return this.pluginAPIs.sharedAPIs.obsidianAPIs.validResourceDirectoryPath_OSView_TextTable();
	}

	isValidExecutableDirectoryRelativePath_OSView_SettingValue(value: string): boolean {
		if (value.length == 0) return true;  // unset value
		return this.isValidExecutableDirectoryRelativePath_OSView(value);
	}

	isValidExecutableDirectoryRelativePath_OSView(value: string): boolean {
		return this.pluginAPIs.sharedAPIs.obsidianAPIs.isValidResourceDirectoryPath_OSView(value);
	}

	isValidExecutableDirectoryRelativePath_OSView2(): boolean {
		return this.isValidExecutableDirectoryRelativePath_OSView(
			this.getExecutableDirectoryRelativePath_OSView()
		);
	}

	async setSaveExecutableDirectoryRelativePath_OSView_async(suggestValue: string): Promise<SetSaveResult<string>> {
		const suggestValueLike = this.pluginAPIs.sharedAPIs.obsidianAPIs.normalizeResourceDirectoryPath_OSView(suggestValue);
		if (this.isValidExecutableDirectoryRelativePath_OSView_SettingValue(suggestValueLike)) {
			const validVal = suggestValueLike;
			if (this.getSettings().executableDirectoryRelativePath_OSView != validVal) {
				this.getSettings().executableDirectoryRelativePath_OSView = validVal;
				await this.saveSettings_async();
				return new SetSaveResult<string>(true, false, true, false, validVal);
			}
			return new SetSaveResult(false, false, true, false, validVal);
		} else {
			const currentValue = this.getExecutableDirectoryRelativePath_OSView();
			if (this.isValidExecutableDirectoryRelativePath_OSView_SettingValue(currentValue)) {
				return new SetSaveResult<string>(false, true, false, false, currentValue);
			} else {
				const defaultValue = this.getDefaultSettings().executableDirectoryRelativePath_OSView;
				this.getSettings().executableDirectoryRelativePath_OSView = defaultValue;
				await this.saveSettings_async();
				return new SetSaveResult<string>(true, false, false, true, defaultValue);
			}
		}
	}

	private async setSaveExecutableDirectoryRelativePath_toValue_OSView_async(value: string): Promise<void> {
		if (this.getSettings().executableDirectoryRelativePath_OSView != value) {
			this.getSettings().executableDirectoryRelativePath_OSView = value;
			await this.saveSettings_async();
		}
	}

	getDefaultSettings(): PluginSettings {
		return this.pluginAPIs.plugin.DEFAULT_SETTINGS;
	}

	async setSaveAllFromDefaultSettings_async() {
		Object.assign(this.getSettings(), this.getDefaultSettings());
		await this.saveSettings_async();
	}

	async saveSettings_async() {
		await this.pluginAPIs.plugin.saveData(this.getSettings());
	}
}
