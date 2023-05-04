import { deletePlugin } from './pluginManage';

plugin.onAllPluginsLoaded(async () => {
	if (getSetting('custom-source-unlocked-1', false)) return;
	if (loadedPlugins?.RevivedUnblockInstaller) {
		if (loadedPlugins.RevivedUnblockInstaller.devMode) {
			await betterncm.fs.remove(loadedPlugins.RevivedUnblockInstaller.pluginPath);
			betterncm_native.app.restart();
		} else {
			const path = await betterncm.fs.readFileText(loadedPlugins.RevivedUnblockInstaller.pluginPath + "/.plugin.path.meta");
			if (!path) return;
			const time = new Date(betterncm_native.fs.getProperties(path).lastModified - 11644473600000);
			const threshold = new Date(2023, 3, 30, 0, 0, 0, 0);
			if (time > threshold) {
				await betterncm.fs.remove(path);
				betterncm_native.app.restart();
			}
		}
	}
});