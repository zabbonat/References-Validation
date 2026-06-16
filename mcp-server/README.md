# CheckIfExist — MCP Server 🔍

Use [CheckIfExist](https://zabbonat.github.io/References-Validation/) directly inside **Claude Desktop**, **VS Code Copilot**, or any MCP-compatible AI assistant. Verify academic references against CrossRef, Semantic Scholar, OpenAlex, arXiv, and DBLP — without leaving your chat.

## ⚡ Quick Install

### 1. Clone the repo

```bash
git clone https://github.com/zabbonat/References-Validation.git
cd References-Validation/mcp-server
npm install
```

### 2. Configure your AI client

#### Claude Desktop

Open your config file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this (replace the path with your actual path):

```json
{
  "mcpServers": {
    "checkifexist": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/References-Validation/mcp-server/src/index.ts"]
    }
  }
}
```

#### VS Code (Copilot)

Add to `.vscode/settings.json`:

```json
{
  "github.copilot.chat.mcpServers": {
    "checkifexist": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/References-Validation/mcp-server/src/index.ts"]
    }
  }
}
```

### 3. Restart your AI client

Restart Claude Desktop (or reload VS Code). You should see the 🔨 tool icon — that means `check_references` is available!

## 🧪 Usage

Just ask Claude naturally:

> "Check if these references are real:
> 1. Vaswani, A. et al. (2017). Attention is all you need. NeurIPS.
> 2. Smith, J. (2023). A paper that does not exist. Nature, 999."

Claude will automatically use CheckIfExist to verify each reference and report:
- ✅ **Verified** — found and metadata matches
- ⚠️ **Partial Match** — found but some metadata differs
- ❌ **Mismatch** — found a different paper
- 🔍 **Not Found** — not in any database

It also detects retracted papers, fake authors, and wrong DOIs.

## 🔧 Supported Input Formats

- **Plain text** — one reference per line (APA, Vancouver, numbered, etc.)
- **BibTeX** — `@article{...}` entries
- **Single reference** — just paste one citation
- **Mixed** — DOIs, arXiv IDs, and free-form text

## 📖 Citation

If you use CheckIfExist, please cite:

```bibtex
@article{abbonato2026checkifexist,
  title={CheckIfExist: Detecting Citation Hallucinations in the Era of AI-Generated Content},
  author={Abbonato, Diletta},
  journal={arXiv preprint arXiv:2602.15871},
  year={2026}
}
```

## License

MIT
