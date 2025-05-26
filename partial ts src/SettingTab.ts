import KORCImageUtilPlugin from "main";
import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import {PluginAPIs} from "./PluginAPIs";
import {SettingsAPIs} from "./SettingsAPIs";

export class SettingTab extends PluginSettingTab {
	plugin: KORCImageUtilPlugin;
	pluginAPIs: PluginAPIs;
	settingsAPIs: SettingsAPIs;

	constructor(app: App, plugin: KORCImageUtilPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.pluginAPIs = plugin.pluginAPIs;
		this.settingsAPIs = this.pluginAPIs.settingsAPIs;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Compress Rename When Add")
			.setDesc("if on, when adding image into vault, compress it, then rename it")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.compressAndRenameImageWhenPaste)
					.onChange(async newValue => {
						this.plugin.settings.compressAndRenameImageWhenPaste = newValue;
						await this.plugin.saveSettings_async();
					})
			})

		new Setting(containerEl)
			.setName("Readonly Mark")
			.setDesc("if on, images with readonly-mark will NOT be modified, \
                        NOT case sensitive, \
                        for example, \
                        when compressing, skip those images, \
                        when renaming, skip those images")
			.addText(text => {
				text
					.setValue(this.plugin.settings.readonlyMark)
					.onChange(async newValue => {
						if (newValue == this.settingsAPIs.getSettings().readonlyMark) return;
						await this.settingsAPIs.setSaveReadonlyMark_async(newValue);
						text.setValue(this.settingsAPIs.getSettings().readonlyMark);
					})
			})

		new Setting(containerEl)
			.setName("Image Directory Name")
			.setDesc("image-owner's pocket, put images into here, relative path")
			.addText(text => {
				text
					.setValue(this.plugin.settings.imageDirectoryName_OSView)
					.onChange(async newValue => {
						if (newValue == this.settingsAPIs.getSettings().imageDirectoryName_OSView) return;
						newValue = newValue.replace('/', '\\');
						newValue = this.pluginAPIs.sharedAPIs.obsidianAPIs.normalizeResourceDirectoryPath_OSView(newValue);
						text.setValue(newValue);
						const setRes = await this.settingsAPIs.setSaveImageDirectoryName_OSView_async(newValue);
						if (!setRes.updated) {
							new Notice(`use only ${this.pluginAPIs.settingsAPIs.validImageDirectoryName_OSView_TextTable()}`);
						}
						text.setValue(this.settingsAPIs.getSettings().imageDirectoryName_OSView);
					})
			})

		new Setting(containerEl)
			.setName("Executable Directory Path")
			.setDesc("here to put executable, absolute path")
			.addText(text => {
				text
					.setValue(this.plugin.settings.executableDirectoryRelativePath_OSView)
					.onChange(async newValue => {
						if (newValue == this.settingsAPIs.getSettings().executableDirectoryRelativePath_OSView) return;
						newValue = newValue.replace('/', '\\');
						newValue = this.pluginAPIs.sharedAPIs.obsidianAPIs.normalizeResourceDirectoryPath_OSView(newValue);
						text.setValue(newValue);
						const setRes = await this.settingsAPIs.setSaveExecutableDirectoryRelativePath_OSView_async(newValue);
						if (!setRes.updated) {
							new Notice(`use only ${this.pluginAPIs.settingsAPIs.validExecutableDirectoryRelativePath_OSView_TextTable()}`);
						}
						text.setValue(this.settingsAPIs.getSettings().executableDirectoryRelativePath_OSView);
					})
			})
	}
}
