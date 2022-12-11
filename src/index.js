import { compareVersions, satisfies } from 'compare-versions';
import { getPluginDownloads } from './analyze';
import { Icon } from './icons';
import { installPlugin, deletePlugin, loadOnlinePlugins, baseURL } from './pluginManage';
import { formatNumber } from './utils';
import FlipMove from 'react-flip-move';
import './styles.scss'




let currentBetterNCMVersion = await betterncm.app.getBetterNCMVersion();

class PluginList extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			onlinePlugins: null,
			pluginsAnalyzeData: null,
			requireReload: false,
			sort_by: 'downloads',
		};
		this.requireReload = this.requireReload.bind(this);
	}

	async componentDidMount() {
		loadOnlinePlugins().then(onlinePlugins => this.setState({ onlinePlugins }));
		getPluginDownloads().then(pluginsAnalyzeData => this.setState({ pluginsAnalyzeData }));
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
			<div>
				<div className="plugin-market-filters">
					<div className="plugin-market-filter-search">
						<Icon name="search"/>
						<input placeholder="搜索..." onChange={e => this.setState({ search: e.target.value })} />
					</div>
					<div className="plugin-market-filter-sort">
						<Icon name="sort"/>
						<button title="下载量" className={this.state.sort_by === 'downloads' ? 'active' : ''} onClick={() => this.setState({ sort_by: 'downloads' })}><Icon name="download"/></button>
						<button title="更新时间" className={this.state.sort_by === 'update' ? 'active' : ''} onClick={() => this.setState({ sort_by: 'update' })}><Icon name="clock"/></button>
						<button title="名称" className={this.state.sort_by === 'name' ? 'active' : ''} onClick={() => this.setState({ sort_by: 'name' })}><Icon name="atoz"/></button>
					</div>
				</div>
				<FlipMove className="plugin-market-container">
					{
						this.state.onlinePlugins
							.filter(
								plugin => {
									if (plugin.hide) return false;
									if (!plugin.betterncm_version) return true;
									return satisfies(currentBetterNCMVersion, plugin.betterncm_version);
								}
							)
							.filter(
								plugin => {
									if (!this.state.search) return true;
									const search = this.state.search.toLowerCase();
									return plugin.name.toLowerCase().includes(search) ||
										plugin.slug.toLowerCase().includes(search) ||
										plugin.author.toLowerCase().includes(search);
								}
							)
							.sort((a, b) => {
								switch (this.state.sort_by) {
									case 'downloads':
										return (this.state.pluginsAnalyzeData?.find(v => v.name === b.slug)?.count ?? 0) - 
											(this.state.pluginsAnalyzeData?.find(v => v.name === a.slug)?.count ?? 0);
									case 'name':
										return a.name > b.name ? 1 : -1;
									case 'update': 
										return b.update_time - a.update_time;
								}
							})
							.map((plugin) => {
								return <div key={plugin.slug} className="plugin-item-wrapper">
									<PluginItem key={plugin.slug} downloads={this.state.pluginsAnalyzeData?.find(v => v.name === plugin.slug)?.count} plugin={plugin} requireReload={this.requireReload} />
								</div>;
							})
					}
				</FlipMove>
				{
					this.state.requireReload ?
						<div className="reload-notice">
							<div>插件的更改需要重载以生效</div>
							<button onClick={async () => {
								await betterncm.app.reloadPlugins();
								betterncm.reload()
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

	getActionbarColor() {
		if (this.state.installed) {
			if (this.state.hasUpdate) {
				return '#66ccff';
			}
			return '#ccff99';
		} else if (this.state.installing || this.state.deleting) {
			return '#ffcc22';
		}
	}

	getActionbarIconColor() {
		if (this.state.installing || this.state.deleting) {
			return '#000';
		}
		if (!this.state.installed) {
			return '#ccc';
		}
		return '#3a3a3a';
	}

	getActionButtons() {
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
				<div className="plugin-item-preview" style={{ 'backgroundImage': `url(${preview})` }}></div>
				<div className="plugin-item-body">
					<div className="plugin-item-info">
						<div className="plugin-item-title">{this.props.plugin.name}</div>
						<div className="plugin-item-author">
							{
								authorLink ?
									(<a onClick={async () => {
										await betterncm.app.exec(authorLink)
									}} target="_blank">{this.props.plugin.author}</a>) :
									(<span>{this.props.plugin.author}</span>)
							}
						</div>
						<div className="plugin-item-description">{this.props.plugin.description}</div>
						<div>
							{ this.props.downloads > 0 && <span className="plugin-item-meta plugin-downloads"><Icon name="download" /><span>{ formatNumber(this.props.downloads) }</span></span> }

							<span className="plugin-item-meta plugin-item-version">
								{
									this.state.hasUpdate ?
										(<span><Icon name="has_update" /> {loadedPlugins[this.props.plugin.slug].manifest.version} → <span className='new-version'>{this.props.plugin.version}</span></span>) :
										(<span><Icon name="tag" />{this.props.plugin.version}</span>)
								}
							</span>
						</div>

						{preview != "unset" ? <div className="plugin-item-bg" style={{ 'backgroundImage': `url(${preview})` }}></div> : null}
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