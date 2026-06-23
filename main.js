const core = require('@actions/core');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const { Octokit } = require("@octokit/rest");
const fs = require('fs');
const os = require('os');

const baseDownloadURL = "https://github.com/vultr/vultr-cli/releases/download"
const fallbackVersion = "3.3.0"
const octokit = new Octokit();

async function downloadDoctl(version) {
    if (process.platform === 'win32') {
        const doctlDownload = await tc.downloadTool(`${baseDownloadURL}/v${version}/vultr-cli_v${version}_windows_amd64.zip`);
        return tc.extractZip(doctlDownload);
    }
    if (process.platform === 'darwin') {
        const doctlDownload = await tc.downloadTool(`${baseDownloadURL}/v${version}/vultr-cli_v${version}_macOs_amd64.tar.gz`);
        return tc.extractTar(doctlDownload);
    }
    const doctlDownload = await tc.downloadTool(`${baseDownloadURL}/v${version}/vultr-cli_v${version}_linux_amd64.tar.gz`);
    return tc.extractTar(doctlDownload);
}

async function run() {
  try { 
    var version = core.getInput('version');
    if ((!version) || (version.toLowerCase() === 'latest')) {
        version = await octokit.repos.getLatestRelease({
            owner: 'vultr',
            repo: 'vultr-cli'
        }).then(result => {
            return result.data.name;
        }).catch(error => {
            // GitHub rate-limits are by IP address and runners can share IPs.
            // This mostly effects macOS where the pool of runners seems limited.
            // Fallback to a known version if API access is rate limited.
            core.warning(`${error.message}

Failed to retrieve latest version; falling back to: ${fallbackVersion}`);
            return fallbackVersion;
        });
    }
    if (version.charAt(0) === 'v') {
        version = version.substr(1);
    }

    var path = tc.find("vultr-cli", version);
    if (!path) {
        const installPath = await downloadDoctl(version);
        path = await tc.cacheDir(installPath, 'vultr-cli', version);
    }
    core.addPath(path);
    core.info(`>>> vultr-cli version v${version} installed to ${path}`);

    // vultr-cli prints `Error reading in config file (~/.vultr-cli.yaml) : ... no
    // such file or directory` to STDOUT (not stderr) when the default config is
    // absent. That line gets prepended to `--output=json` results and breaks any
    // downstream `vultr-cli ... | jq` pipeline. Fresh CI runners have no config
    // file, so create an empty one to guarantee clean stdout for all callers.
    const configPath = `${os.homedir()}/.vultr-cli.yaml`;
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, '');
        core.info(`>>> Created empty vultr-cli config at ${configPath}`);
    }

    var token = core.getInput('token', { required: true });
    process.env.VULTR_API_KEY = token;
    await exec.exec('vultr-cli account');
    core.info('>>> Successfully installed vultr-cli and confirmed API key');
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run();
