const { spawn } = require('child_process');

const server = spawn('cmd', ['/c', 'npx', 'n8n-mcp'], {
    env: {
        ...process.env,
        MCP_MODE: 'stdio',
        N8N_API_URL: "https://n8n.rmlabco.com",
        N8N_API_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkYjExZTM0MC0zMGI0LTRjMzQtYmRjMS01YWJiZDg4MWMyZGYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY4NDkxMzA4fQ.LBrLTLF8_VjEWIEkFd_YgE6b0DlT74c3ppZHG8TH_W4"
    },
    stdio: ['pipe', 'pipe', 'inherit']
});

const request = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
        name: "n8n_list_workflows",
        arguments: {
            limit: 10
        }
    },
    id: 1
};

server.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const response = JSON.parse(line);
            if (response.result) {
                console.log(JSON.stringify(response.result, null, 2));
                server.kill();
                process.exit(0);
            }
        } catch (e) {
            // ignore partial json
        }
    }
});

server.stdin.write(JSON.stringify(request) + '\n');
