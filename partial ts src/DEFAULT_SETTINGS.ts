import { PluginSettings } from "./PluginSettings";

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {
    compressAndRenameImageWhenPaste: false,
    pngOnly: false,
    readonlyMark: '.readonly.',
};
