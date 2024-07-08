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
        
    }
}
