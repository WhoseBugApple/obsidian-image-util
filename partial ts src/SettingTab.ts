import KORCImageUtilPlugin from "main";
import { App, Notice, PluginSettingTab, Setting } from "obsidian";

export class SettingTab extends PluginSettingTab {
    plugin: KORCImageUtilPlugin;

    constructor(app: App, plugin: KORCImageUtilPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Compress Rename When Add")
            .setDesc("if on, when adding image into vault, compress it, then rename it")
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.compressAndRenameImageWhenPaste)
                    .onChange(async newValue => {
                        this.plugin.settings.compressAndRenameImageWhenPaste = newValue; 
                        await this.plugin.saveSettings_async(); })
                })
        
        new Setting(containerEl)
            .setName("PNG Only")
            .setDesc("if on, when compress, only png is allowed")
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.pngOnly)
                    .onChange(async newValue => {
                        this.plugin.settings.pngOnly = newValue; 
                        await this.plugin.saveSettings_async(); })
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
                        this.plugin.settings.readonlyMark = newValue; 
                        await this.plugin.saveSettings_async(); })
                    })
        
        new Setting(containerEl)
        .setName("Image Folder Name")
        .setDesc("image-owner's pocket, put images into here")
        .addText(text => {
            text
                .setValue(this.plugin.settings.imageFolderName)
                .onChange(async newValue => {
                        if (!this.plugin.isValidImageFolderNameSetting(newValue)) {
                            new Notice(`"${newValue}" is NOT a valid folder name. use only a-z A-Z 0-9 ' ' '-' '_'`);
                            if (this.plugin.isValidImageFolderNameSetting(this.plugin.settings.imageFolderName)) {
                                text.setValue(this.plugin.settings.imageFolderName);
                                return;
                            } else {
                                var empty = '';
                                text.setValue(empty);
                                if (this.plugin.settings.imageFolderName != empty) {
                                    this.plugin.settings.imageFolderName = empty; 
                                    await this.plugin.saveSettings_async();
                                }
                                return;
                            }
                        }
                        if (this.plugin.settings.imageFolderName != newValue ) {
                            this.plugin.settings.imageFolderName = newValue; 
                            await this.plugin.saveSettings_async();
                        }
                    })
                })
        
    }


}
