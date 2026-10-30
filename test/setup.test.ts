import { describe, expect, it } from 'vitest';
import { renderSetup } from '../src/setup.js';

const win = { indexPath: 'C:\\tools\\zhizhuip-agent-tools\\dist\\src\\index.js', token: 'sk-abc', readonly: false, platform: 'win32' as const };
const args = ['C:/tools/zhizhuip-agent-tools/dist/src/index.js'];
const env = { ZHIZHUIP_TOKEN: 'sk-abc' };

describe('renderSetup', () => {
  it('Windows 路径转成正斜杠，Claude Code 与 Codex 各给一条命令', () => {
    const out = renderSetup(win);
    expect(out).toContain('claude mcp add -s user -e ZHIZHUIP_TOKEN=sk-abc zhizhuip -- node C:/tools/zhizhuip-agent-tools/dist/src/index.js');
    expect(out).toContain('codex mcp add zhizhuip --env ZHIZHUIP_TOKEN=sk-abc -- node C:/tools/zhizhuip-agent-tools/dist/src/index.js');
    expect(out).not.toContain('--readonly');
  });

  it('标准 mcpServers JSON 原样可粘贴，VS Code 用 servers，Zed 用 context_servers，Codex 有 TOML 段', () => {
    const out = renderSetup(win);
    expect(out).toContain(JSON.stringify({ mcpServers: { zhizhuip: { command: 'node', args, env } } }, null, 2));
    expect(out).toContain(JSON.stringify({ servers: { zhizhuip: { type: 'stdio', command: 'node', args, env } } }, null, 2));
    expect(out).toContain(JSON.stringify({ context_servers: { zhizhuip: { command: 'node', args, env } } }, null, 2));
    expect(out).toContain(
      '[mcp_servers.zhizhuip]\ncommand = "node"\nargs = ["C:/tools/zhizhuip-agent-tools/dist/src/index.js"]\n\n[mcp_servers.zhizhuip.env]\nZHIZHUIP_TOKEN = "sk-abc"',
    );
  });

  it('--readonly 进入每种客户端的参数列表', () => {
    const out = renderSetup({ ...win, readonly: true });
    expect(out).toContain('-- node C:/tools/zhizhuip-agent-tools/dist/src/index.js --readonly');
    expect(out).toContain('"--readonly"');
    expect(out).toContain('args = ["C:/tools/zhizhuip-agent-tools/dist/src/index.js", "--readonly"]');
  });

  it('--npx 时命令是 npx -y github:仓库，不含本机路径，--readonly 跟在后面', () => {
    const out = renderSetup({ ...win, npx: true, readonly: true });
    expect(out).toContain('claude mcp add -s user -e ZHIZHUIP_TOKEN=sk-abc zhizhuip -- npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools --readonly');
    expect(out).toContain(JSON.stringify({ mcpServers: { zhizhuip: { command: 'npx', args: ['-y', 'github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools', '--readonly'], env } } }, null, 2));
    expect(out).toContain('[mcp_servers.zhizhuip]\ncommand = "npx"\nargs = ["-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools", "--readonly"]');
    expect(out).not.toContain('C:/tools');
  });

  it('安装路径含空格时命令行里的路径加引号，JSON 片段照旧', () => {
    const spaced = 'C:/Users/张 三/zhizhuip-agent-tools/dist/src/index.js';
    const out = renderSetup({ ...win, indexPath: 'C:\\Users\\张 三\\zhizhuip-agent-tools\\dist\\src\\index.js', readonly: true });
    expect(out).toContain(`claude mcp add -s user -e ZHIZHUIP_TOKEN=sk-abc zhizhuip -- node "${spaced}" --readonly`);
    expect(out).toContain(`codex mcp add zhizhuip --env ZHIZHUIP_TOKEN=sk-abc -- node "${spaced}" --readonly`);
    expect(out).toContain(JSON.stringify({ mcpServers: { zhizhuip: { command: 'node', args: [spaced, '--readonly'], env } } }, null, 2));
  });

  it('没给 token 时留占位并提醒', () => {
    const out = renderSetup({ ...win, token: undefined });
    expect(out).toContain('ZHIZHUIP_TOKEN=你的token');
    expect(out).toContain('把 你的token 换成');
  });

  it('配置文件位置按操作系统给', () => {
    const w = renderSetup(win);
    expect(w).toContain('%APPDATA%\\Claude\\claude_desktop_config.json');
    expect(w).toContain('~/.codeium/windsurf/mcp_config.json');
    const mac = renderSetup({ ...win, indexPath: '/opt/zhizhuip-agent-tools/dist/src/index.js', platform: 'darwin' });
    expect(mac).toContain('~/Library/Application Support/Claude/claude_desktop_config.json');
    expect(mac).toContain('~/.codeium/windsurf/mcp_config.json');
    expect(mac).toContain('-- node /opt/zhizhuip-agent-tools/dist/src/index.js');
  });
});
