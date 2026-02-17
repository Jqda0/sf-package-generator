# Salesforce Package.xml Generator

A Visual Studio Code extension that provides an interactive UI to browse, select, and generate `package.xml` files for Salesforce org development. Built for the **Org Development Model** workflow — similar to the Eclipse Force.com IDE's Add/Remove Metadata Components experience, but modernized for VS Code.

## Features

### 🗂️ Interactive Metadata Browser

- Two-panel grid layout — metadata types on the left, components on the right
- Click any metadata type to load and browse its individual components
- Search/filter boxes on both panels for quick navigation
- Badge counts showing the number of children per metadata type

### ✅ Flexible Selection

- **Select All** — bulk-selects all metadata types (skipping Reports, Dashboards, Email Templates, and Documents that require special folder handling)
- **Clear All** — deselects everything in one click
- Per-component checkboxes for granular control
- Select/deselect all components within a single metadata type

### 📄 Package.xml Generation

- **Update Package.xml** — writes the selected metadata directly to `manifest/package.xml` in your workspace and opens it in the editor
- **Copy to Clipboard** — copies the formatted `package.xml` content without modifying any files, so you can paste it wherever you need
- Automatically detects the org's API version via `sf org display`, with a fallback to API version 62.0

### ⚡ Workspace Cache

- Caches metadata types and component lists in `.sf/sf-package-generator-cache.json` to speed up repeat loads
- **24-hour TTL** — cache auto-expires after one day
- **Refresh** button in the toolbar to clear the cache and re-fetch from the org on demand
- Cache age indicator (e.g. "⚡ Cached (12m ago)") shown in the toolbar

### 🛡️ Non-Retrievable Type Filtering

Automatically filters out ~20 metadata types that are deprecated, removed, or cannot be retrieved via the Metadata API — including legacy S-Controls, child types like `CustomField`/`ValidationRule`, and removed types like `EventDelivery`/`EventSubscription`.

### 🎨 Modern UI

- Native VS Code look and feel using CSS custom properties (`--vscode-*` tokens)
- Matches your current theme (dark, light, or high-contrast) automatically
- Smooth scrollbars, hover states, focus indicators, and loading animations

## Prerequisites

- [Salesforce CLI (`sf`)](https://developer.salesforce.com/tools/salesforcecli) v2 or later
- [Salesforce Extensions for VS Code](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode)
- VS Code v1.76 or later

## Getting Started

1. Set up your project using **SF: Create Project with Manifest** and authorize an org with **SF: Authorize an Org** (skip if already done). See [Org Development Model with VS Code](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_develop_any_org.htm) for details.
2. Open the Command Palette (`Cmd+Shift+P` on macOS / `Ctrl+Shift+P` on Windows/Linux).
3. Run **SF Package.xml Generator: Choose Metadata Components**.
4. Browse and select the metadata you need.
5. Click **Update Package.xml** to write the file, or **Copy to Clipboard** to grab the XML content.
6. Optionally run **SF: Retrieve Source in Manifest from Org** to pull the selected metadata into your project.

## Extension Commands

| Command                                                | Description                      |
| ------------------------------------------------------ | -------------------------------- |
| `SF Package.xml Generator: Choose Metadata Components` | Opens the metadata browser panel |

## License

[BSD 3-Clause](LICENSE.txt) © 2026 jqda0
