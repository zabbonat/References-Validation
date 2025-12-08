# CheckIfExist - Reference Verification Tool 🔍

**CheckIfExist** is a powerful tool for researchers and academics to verify the authenticity of references. It cross-checks citations against the CrossRef database to detect hallucinations, verify metadata, and ensure accuracy in your bibliography.

![App Screenshot](public/screenshot.png) *(Add a screenshot if possible)*

## 🚀 Features
- **Quick Verification**: Verification of single references via text selection or clipboard.
- **Batch Mode**: Paste a list of BibTeX entries to verify them all at once.
- **Advanced Logic**:
  - Detects partial matches (e.g., correct title but wrong author).
  - Handles "First Name Last Name" vs "Last Name First Name" variations.
  - Penalizes scores for missing authors in the query.
- **Output Formats**:
  - **APA Style**: Get the correct APA citation instantly.
  - **BibTeX**: Generates a valid BibTeX entry for the *found* paper.


---

## 📥 Download Desktop App (.exe)
**[👉 Download Latest Windows Installer](https://github.com/zabbonat/References-Validation/releases/latest/download/CheckIfExist.exe)**

---

## 🌐 Web Version
**[👉 Open Web App](https://zabbonat.github.io/References-Validation/)**


---

## 🛠️ Installation & Build

### Prerequisites
- Node.js (v18+)
- Git

### Build from Source
```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/CheckIfExist.git

# Install dependencies
npm install

# Run locally
npm run dev

# Build for Web
npm run build

# Build Windows .exe
npm run electron:pack
```

## 📄 License
MIT
