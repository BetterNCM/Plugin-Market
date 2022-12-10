import { compareVersions, satisfies } from 'compare-versions';
import { Icon } from './icons';
import './styles.scss'

const baseURL = "https://gitee.com/microblock/BetterNCMPluginsMarketData/raw/master/";

const loadOnlinePlugins = async () => {
	return await (await fetch(baseURL + "plugins.json?" + new Date().getTime())).json();
}

let currentBetterNCMVersion = await betterncm.app.getBetterNCMVersion();

async function installPlugin(plugin, onlinePlugins) {
	for (let requirement of (plugin.requirements ?? [])) {
		if (loadedPlugins[requirement]) continue;

		let requiredPlugin = onlinePlugins.find(plugin => plugin.slug === requirement);
		if (requiredPlugin) {
			const result = await installPlugin(requiredPlugin);
			if (result != "success") return result;
		} else {
			return `${plugin.name} 的依赖 ${requiredPlugin} 解析失败！插件将不会安装`;
		}
	}

	await betterncm.fs.writeFile("./plugins/" + plugin.file, await (await fetch(baseURL + plugin['file-url'])).blob());

	return "success";
}
async function deletePlugin(plugin) {
	if (!loadedPlugins[plugin.slug]) {
		if (await betterncm.fs.exists("./plugins/" + plugin.file)) {
			await betterncm.fs.remove("./plugins/" + plugin.file);
			return "success";
		}
		return "插件未安装";
	}
	let path = await betterncm.fs.readFileText(loadedPlugins[plugin.slug].pluginPath + "/.plugin.path.meta");
	if (path) {
		await betterncm.fs.remove(path);
		return "success";
	}
	return "未找到插件路径，卸载失败";
}

class PluginList extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			onlinePlugins: null,
			requireReload: false
		};
		this.requireReload = this.requireReload.bind(this);
	}

	async componentDidMount() {
		this.setState({
			onlinePlugins: await loadOnlinePlugins()
		});
	}

	requireReload() {
		this.setState({
			requireReload: true
		});
	}

	render() {
		if (!this.state.onlinePlugins) {
			return <div className="plugin-market-container loading">
				<Icon name="loading" className="spinning" />
				<div>加载插件中...</div>
			</div>;
		}
		return (
			<div className="plugin-market-container">
				{
					this.state.onlinePlugins
					.filter(
						plugin => {
							if (plugin.hide) return false;
							if (!plugin.betterncm_version) return true;
							return satisfies(currentBetterNCMVersion, plugin.betterncm_version);
						}
					)
					.sort((a, b) => {
						return a.name > b.name ? 1 : -1;
					})
					.map((plugin) => {
						return <PluginItem plugin={plugin} requireReload={this.requireReload} />;
					})
				}
				{
					this.state.requireReload ? 
						<div className="reload-notice">
							<div>插件的更改需要重载以生效</div>
							<button onClick={ async () => {
								await betterncm.app.reloadPlugins();
								document.location.reload();
							}}><Icon name="reload" /> 重载</button>
						</div>
					: null
				}

			</div>
		);
	}
}
class PluginItem extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			installed: false,
			installing: false,
			deleting: false,
			hasUpdate: false,
			requireReload: false
		};
	}

	async componentDidMount() {
		const installed = !!loadedPlugins[this.props.plugin.slug];
		this.setState({
			installed: installed
		});
		if (installed) {
			if (compareVersions(this.props.plugin.version, loadedPlugins[this.props.plugin.slug].manifest.version) > 0) {
				this.setState({
					hasUpdate: true
				});
			}
		}
	}

	async install() {
		if (this.state.installing || this.state.deleting) return;
		this.setState({
			installing: true
		});
		const result = await installPlugin(this.props.plugin, this.props.onlinePlugins);
		if (result == 'success') {
			this.setState({
				installed: true,
				installing: false,
				hasUpdate: false,
				requireReload: true
			});
			this.props.requireReload();
		} else {
			this.setState({
				installing: false
			});
			console.log(result);
		}
	}

	async delete() {
		if (this.state.installing || this.state.deleting) return;
		this.setState({
			deleting: true
		});
		const result = await deletePlugin(this.props.plugin);
		if (result == 'success') {
			this.setState({
				installed: false,
				deleting: false,
				hasUpdate: false,
				requireReload: true
			});
			this.props.requireReload();
		} else {
			this.setState({
				deleting: false
			});
			console.log(result);
		}
	}

	getActionbarColor () {
		if (this.state.installed) {
			if (this.state.hasUpdate) {
				return '#66ccff';
			}
			return '#ccff99';
		} else if (this.state.installing || this.state.deleting) {
			return '#ffcc22';
		}
	}

	getActionbarIconColor () {
		if (this.state.installing || this.state.deleting) {
			return '#000';
		}
		if (!this.state.installed) {
			return '#ccc';
		}
		return '#3a3a3a';
	}

	getActionButtons () {
		let buttons = [];
		if (this.state.installed) {
			buttons.push(
				this.state.deleting ? (
					<button className="plugin-action-button">
						<Icon name="loading" className="spinning" />
					</button>
				) : (
					<button className="plugin-action-button" onClick={() => { this.delete() }}>
						<Icon name="delete" />
					</button>
				)
			)
			if (this.state.hasUpdate) {
				buttons.push(
					this.state.installing ? (
						<button className="plugin-action-button">
							<Icon name="loading" className="spinning" />
						</button>
					) : (
						<button className="plugin-action-button" onClick={() => { this.install() }}>
							<Icon name="update" />
						</button>
					)
				)
			}
		} else {
			buttons.push(
				this.state.installing ? (
					<button className="plugin-action-button">
						<Icon name="loading" className="spinning" />
					</button>
				) : (
					<button className="plugin-action-button" onClick={() => { this.install() }}>
						<Icon name="download" />
					</button>
				)
			)
		}
		return buttons;
	}


	render() {
		let preview = this.props.plugin.preview ? baseURL + this.props.plugin.preview : "unset";
		let authorLink = this.props.plugin['author_link'] ?? (this.props.plugin['author_links'] ?? [])[0] ?? null;
		if (authorLink) {
			if (!authorLink.startsWith('http')) {
				authorLink = 'https://' + authorLink;
			}
			if (!authorLink.match(/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/)) {
				authorLink = null;
			}
		}
		return (
			<div className={`plugin-item ${this.state.installing ? 'installing' : ''} ${this.state.deleting ? 'deleting' : ''}`}>
				<div className="plugin-item-preview" style={{ 'backgroundImage': `url(${ preview })`}}></div>
				<div className="plugin-item-body">
					<div className="plugin-item-info">
						<div className="plugin-item-title">{this.props.plugin.name}</div>
						<div className="plugin-item-author">
							{
								authorLink ?
								( <a onClick={ async () => {
									    await betterncm.app.exec(authorLink)
									}} target="_blank">{this.props.plugin.author}</a> ) :
								( <span>{this.props.plugin.author}</span> )
							}
						</div>
						<div className="plugin-item-description">{this.props.plugin.description}</div>
						<div className="plugin-item-version">
							{
								this.state.hasUpdate ?
								( <span><Icon name="has_update" /> { loadedPlugins[this.props.plugin.slug].manifest.version } → <span className='new-version'>{ this.props.plugin.version }</span></span> ) :
								( <span>{ this.props.plugin.version }</span> )
							}
						</div>
						{ preview != "unset" ? <div className="plugin-item-bg" style={{ 'backgroundImage': `url(${ preview })`}}></div> : null }
					</div>	
				</div>
				<div className="plugin-item-actions" style={{ backgroundColor: this.getActionbarColor(), fill: this.getActionbarIconColor() }}>
					{this.getActionButtons()}
				</div>
				<div className="plugin-item-state-indicator-container">
					{
						this.state.installed ? (
							<div className="plugin-item-state-indicator installed">
								<Icon name="circle_check" />
							</div>
						) : null
					}
				</div>
			</div>
		)
	}
}



plugin.onConfig((tools) => {
	let dom = document.createElement('div');
	ReactDOM.render(<PluginList />, dom);
	return dom;
});