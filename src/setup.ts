export interface SetupOptions {
  /** dist/src/index.js 的绝对路径 */
  indexPath: string;
  token?: string;
  readonly: boolean;
  /** 用 npx -y 从 GitHub 拉起，不依赖本机安装位置；发布到 npm 之后把 PACKAGE 换成包名即可 */
  npx?: boolean;
  platform: NodeJS.Platform;
}

const NAME = 'zhizhuip';
const PACKAGE = 'github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools';
const ENV = 'ZHIZHUIP_TOKEN';

/**
 * 生成手工接入 MCP 的客户端配置片段，不修改配置文件。
 *
 * @param o 启动路径、占位或实际 token、只读模式、下载方式及操作系统。
 * @return string，各客户端配置文本；提供 token 时输出会包含该值。
 */
export function renderSetup(o: SetupOptions): string {
  const script = o.indexPath.replace(/\\/g, '/');
  const token = o.token ?? '你的token';
  const command = o.npx ? 'npx' : 'node';
  const args = [...(o.npx ? ['-y', PACKAGE] : [script]), ...(o.readonly ? ['--readonly'] : [])];
  const env = { [ENV]: token };
  // 安装目录带空格时命令行里的路径要加引号，JSON/TOML 片段由 JSON.stringify 自己处理
  const cli = [command, ...args].map(a => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
  const json = (v: unknown): string => JSON.stringify(v, null, 2);
  const standard = json({ mcpServers: { [NAME]: { command, args, env } } });
  const tomlArgs = `[${args.map(a => JSON.stringify(a)).join(', ')}]`;

  const win = o.platform === 'win32';
  const desktopPath = win
    ? '%APPDATA%\\Claude\\claude_desktop_config.json'
    : o.platform === 'darwin'
      ? '~/Library/Application Support/Claude/claude_desktop_config.json'
      : '~/.config/Claude/claude_desktop_config.json';
  const windsurfPath = '~/.codeium/windsurf/mcp_config.json';

  return [
    `zhizhuip-agent-tools 客户端配置片段${o.readonly ? '（只读模式）' : '（全部工具）'}`,
    '',
    `服务名 ${NAME}；命令 ${command}；参数 ${JSON.stringify(args)}；环境变量 ${ENV}。`,
    ...(o.token ? [] : ['下面所有片段里请把 你的token 换成蜘蛛 IP 网站 API Keys 页面生成的 API Key，做法见 README。']),
    '以下手工配置通过服务的 env 提供 token；客户端不一定继承另一个终端的环境变量。统一安装器由启动器读取私有凭证文件。配置完成后重新加载对应客户端。',
    '',
    '== Claude Code ==',
    `claude mcp add -s user -e ${ENV}=${token} ${NAME} -- ${cli}`,
    '',
    '== Codex CLI ==',
    `codex mcp add ${NAME} --env ${ENV}=${token} -- ${cli}`,
    '或写进 $CODEX_HOME/config.toml（默认 ~/.codex/config.toml）：',
    `[mcp_servers.${NAME}]`,
    `command = "${command}"`,
    `args = ${tomlArgs}`,
    '',
    `[mcp_servers.${NAME}.env]`,
    `${ENV} = "${token}"`,
    '',
    `== Claude Desktop ==（${desktopPath}）`,
    standard,
    '',
    '== Cursor ==（全局 ~/.cursor/mcp.json，或项目内 .cursor/mcp.json）',
    standard,
    '',
    `== 经典 Windsurf ==（${windsurfPath}；不代表 Devin 新路径）`,
    standard,
    '',
    '== VS Code ==（命令面板 "MCP: Open User Configuration" 打开的 mcp.json，或项目内 .vscode/mcp.json）',
    json({ servers: { [NAME]: { type: 'stdio', command, args, env } } }),
    '',
    '== Zed ==（命令面板 "zed: open settings file" 打开的 settings.json）',
    json({ context_servers: { [NAME]: { command, args, env } } }),
    '',
    '== 其它支持 stdio 的客户端 ==（标准 mcpServers 格式）',
    standard,
    '',
  ].join('\n');
}
