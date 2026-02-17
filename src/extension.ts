import * as path from "path";
import * as vscode from "vscode";
import * as child from "child_process";
import {
  FALLBACK_API_VERSION,
  CACHE_TTL_MS,
  NON_RETRIEVABLE_TYPES,
  REPORT_FOLDER_MAP,
  buildPackageMap,
  buildSelectedMetadataMap,
  generatePackageXmlString,
} from "./packageUtils.js";

const fs = require("fs");
const xml2js = require("xml2js");
let DEFAULT_API_VERSION = "";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("sfPackageGen.chooseMetadata", async () => {
      DEFAULT_API_VERSION = await getAPIVersion();
      console.log("DEFAULT_API_VERSION " + DEFAULT_API_VERSION);
      CodingPanel.createOrShow(context.extensionPath);
    }),
  );
}

function getAPIVersion(): Promise<string> {
  console.log("getAPIVersion invoked");
  return new Promise((resolve, _reject) => {
    const sfCmd = "sf org display --json";
    const foo: child.ChildProcess = child.exec(sfCmd, {
      maxBuffer: 1024 * 1024 * 6,
      cwd: vscode.workspace.workspaceFolders[0].uri.fsPath,
    });
    let bufferOutData = "";
    let stderrData = "";
    foo.stdout.on("data", (dataArg: any) => {
      console.log("stdout: " + dataArg);
      bufferOutData += dataArg;
    });

    foo.stderr.on("data", (data: any) => {
      console.log("stderr: " + data);
      stderrData += data;
    });

    foo.on("exit", (code: number, _signal: string) => {
      console.log("exited with code " + code);
      console.log("bufferOutData " + bufferOutData);
      try {
        const data = JSON.parse(bufferOutData);
        // SF CLI v2 may nest result differently
        let apiVersion = data?.result?.apiVersion;
        if (!apiVersion) {
          console.log("apiVersion not found in result, using fallback");
          apiVersion = FALLBACK_API_VERSION;
        }
        console.log("apiVersion " + apiVersion);
        resolve(apiVersion);
      } catch (e) {
        console.error("Error parsing sf org display output: " + e);
        console.error("stderr: " + stderrData);
        vscode.window.showWarningMessage(
          "Could not determine API version from org. Using default version " +
            FALLBACK_API_VERSION,
        );
        resolve(FALLBACK_API_VERSION);
      }
    });
  });
}
/**
 * Manages cat coding webview panels
 */
class CodingPanel {
  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: CodingPanel | undefined;

  public static readonly viewType = "Coding";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private _disposables: vscode.Disposable[] = [];
  private reportFolderMap = REPORT_FOLDER_MAP;
  // WILDCARD_TYPES imported from packageUtils.ts

  // NON_RETRIEVABLE_TYPES imported from packageUtils.ts

  private VERSION_NUM = DEFAULT_API_VERSION;
  private static CACHE_FILE_NAME = ".sf-package-generator-cache.json";
  private infoMsg = "All metadata selected except ";

  private static getCachePath(): string {
    return path.join(
      vscode.workspace.workspaceFolders[0].uri.fsPath,
      ".sf",
      CodingPanel.CACHE_FILE_NAME,
    );
  }

  private static readCache(): any | null {
    try {
      const cachePath = CodingPanel.getCachePath();
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      const raw = fs.readFileSync(cachePath, "utf-8");
      const cache = JSON.parse(raw);
      const age = Date.now() - (cache.timestamp || 0);
      if (age > CACHE_TTL_MS) {
        console.log(
          "Cache expired (age: " + Math.round(age / 1000 / 60) + " min)",
        );
        return null;
      }
      console.log("Cache hit (age: " + Math.round(age / 1000 / 60) + " min)");
      return cache;
    } catch (e) {
      console.error("Error reading cache: " + e);
      return null;
    }
  }

  private static writeCache(cache: any): void {
    try {
      const cachePath = CodingPanel.getCachePath();
      const cacheDir = path.dirname(cachePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      cache.timestamp = Date.now();
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
      console.log("Cache written to " + cachePath);
    } catch (e) {
      console.error("Error writing cache: " + e);
    }
  }

  private static clearCache(): void {
    try {
      const cachePath = CodingPanel.getCachePath();
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
        console.log("Cache cleared");
      }
    } catch (e) {
      console.error("Error clearing cache: " + e);
    }
  }

  public static createOrShow(extensionPath: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (CodingPanel.currentPanel) {
      CodingPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      CodingPanel.viewType,
      "Choose Metadata Components",
      column || vscode.ViewColumn.One,
      {
        // Enable javascript in the webview
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    CodingPanel.currentPanel = new CodingPanel(panel, extensionPath);
  }

  public static revive(panel: vscode.WebviewPanel, extensionPath: string) {
    CodingPanel.currentPanel = new CodingPanel(panel, extensionPath);
  }

  private constructor(panel: vscode.WebviewPanel, extensionPath: string) {
    this._panel = panel;
    this._extensionPath = extensionPath;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "fetchChildren": {
            console.log("onDidReceiveMessage fetchChildren");
            const metadataType = message.metadataType;
            this.fetchChildren(metadataType);
            return;
          }

          case "buildPackageXML":
            console.log("onDidReceiveMessage buildPackageXML");
            this.buildPackageXML(message.selectedNodes, false);
            return;

          case "getMetadataTypes":
            console.log("onDidReceiveMessage getMetadataTypes");
            this.getMetadataTypes({});
            return;

          case "copyToClipboard":
            console.log("onDidReceiveMessage copyToClipboard");
            this.buildPackageXML(message.selectedNodes, true);
            return;

          case "selectAll": {
            console.log("onDidReceiveMessage selectAll");
            const selectedMetadata = message.selectedMetadata;
            const skippedMetadataTypes = message.skippedMetadataTypes;
            this.fetchAllChildren(selectedMetadata, skippedMetadataTypes, 0);
            return;
          }
          case "INIT_LOAD_REQUEST":
            console.log("onDidReceiveMessage INIT_LOAD_REQUEST");
            this.handleInitLoadRequest();
            return;

          case "FETCH_CHILDREN_REQUEST":
            console.log("onDidReceiveMessage FETCH_CHILDREN");
            this.fetchChildren(message.metadataType);
            return;

          case "UPDATE_PACKAGE_XML":
            console.log("onDidReceiveMessage UPDATE_PACKAGE_XML");
            this.handleUpdatePackageXml(message.metadataTypes);
            return;

          case "COPY_TO_CLIPBOARD":
            console.log("onDidReceiveMessage COPY_TO_CLIPBOARD");
            this.handleCopyToClipboard(message.metadataTypes);
            return;

          case "REFRESH_CACHE":
            console.log("onDidReceiveMessage REFRESH_CACHE");
            CodingPanel.clearCache();
            this.handleInitLoadRequest();
            return;

          case "OPEN_URL":
            console.log("onDidReceiveMessage OPEN_URL");
            this.openUrl(message.url);
            return;
        }
      },
      null,
      this._disposables,
    );
  }

  private buildPackageXML(selectedNodes, isCopyToClipboard) {
    console.log("Invoked buildPackageXML");
    if (!selectedNodes || selectedNodes.length == 0) {
      vscode.window.showErrorMessage(
        "Please select components for package.xml",
      );
      return;
    }

    const mpPackage = this.buildPackageMap(selectedNodes);
    this.generatePackageXML(mpPackage, isCopyToClipboard);
  }

  private buildPackageMap(selectedNodes) {
    console.log("Invoked buildPackageMap");
    const mpPackage = buildPackageMap(selectedNodes);
    for (const [k, v] of mpPackage) {
      console.log(k, v);
    }
    return mpPackage;
  }

  private generatePackageXML(mpPackage, isCopyToClipboard) {
    console.log("Invoked generatePackageXML");
    const xmlString = generatePackageXmlString(mpPackage, this.VERSION_NUM);
    if (!xmlString) {
      console.log("generatePackageXML: empty map, nothing to generate");
      return;
    }
    console.log(xmlString);

    if (isCopyToClipboard) {
      console.log("Copy to Clipboard - Initiated");
      vscode.env.clipboard.writeText(xmlString).then(() => {
        vscode.window.showInformationMessage(
          "Contents Copied to Clipboard successfully!!",
        );
      });
    } else {
      fs.writeFile(
        vscode.workspace.workspaceFolders[0].uri.fsPath +
          "/manifest/package.xml",
        xmlString,
        (err) => {
          if (err) {
            console.log(err);
            vscode.window.showErrorMessage(err);
          }
          console.log("Successfully Written to File.");
          vscode.workspace
            .openTextDocument(
              vscode.workspace.workspaceFolders[0].uri.fsPath +
                "/manifest/package.xml",
            )
            .then((data) => {
              console.log("Opened " + data.fileName);
              vscode.window.showTextDocument(data);
            });
        },
      );
    }
  }

  private fetchChildren(metadataType) {
    console.log("Invoked fetchChildren");
    const mType = metadataType.id;
    const node = metadataType;
    console.log("Invoked fetchChildren " + JSON.stringify(node));

    // Check cache for this metadata type's children
    const cache = CodingPanel.readCache();
    if (
      cache &&
      cache.children &&
      cache.children[mType] &&
      cache.apiVersion === this.VERSION_NUM
    ) {
      console.log("Loading children for " + mType + " from cache");
      this._panel.webview.postMessage({
        command: "listmetadata",
        results: cache.children[mType],
        metadataType: mType,
      });
      return;
    }

    if (!node.inFolder) {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Processing Metadata : " + mType,
          cancellable: true,
        },
        (progress, token) => {
          token.onCancellationRequested(() => {
            console.log("User canceled the long running operation");
          });

          const p = new Promise<void>((resolve) => {
            const sfCmd =
              "sf org list metadata --metadata-type " +
              mType +
              " --api-version " +
              this.VERSION_NUM +
              " --json";
            const foo: child.ChildProcess = child.exec(sfCmd, {
              cwd: vscode.workspace.workspaceFolders[0].uri.fsPath,
            });

            let bufferOutData = "";

            foo.stdout.on("data", (dataArg: any) => {
              console.log("stdout: " + dataArg);
              bufferOutData += dataArg;
            });

            foo.stderr.on("data", (data: any) => {
              console.log("stderr: " + data);
            });

            foo.stdin.on("data", (data: any) => {
              console.log("stdin: " + data);
            });

            foo.on("exit", (code, _signal) => {
              console.log("exit code " + code);
              console.log("bufferOutData " + bufferOutData);
              try {
                const data = JSON.parse(bufferOutData);
                const results = data.result;
                // Cache the children results
                this.cacheChildrenResults(mType, results);
                this._panel.webview.postMessage({
                  command: "listmetadata",
                  results: results,
                  metadataType: mType,
                });
              } catch (e) {
                console.error(
                  "Error parsing list metadata output for " + mType + ": " + e,
                );
                vscode.window.showErrorMessage(
                  "Error fetching metadata for " +
                    mType +
                    ". Make sure your SF CLI is authenticated and up to date.",
                );
                this._panel.webview.postMessage({
                  command: "listmetadata",
                  results: [],
                  metadataType: mType,
                });
              }
              resolve();
            });
          });

          return p;
        },
      );
    } else {
      //get the folder

      const folderType = this.reportFolderMap[mType];
      const sfCmd =
        "sf org list metadata --metadata-type " +
        folderType +
        " --api-version " +
        this.VERSION_NUM +
        " --json";

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Processing Metadata : " + folderType,
          cancellable: true,
        },
        (progress, token) => {
          token.onCancellationRequested(() => {
            console.log("User canceled the long running operation");
          });

          const p = new Promise((resolve) => {
            const foo: child.ChildProcess = child.exec(sfCmd, {
              maxBuffer: 1024 * 1024 * 6,
              cwd: vscode.workspace.workspaceFolders[0].uri.fsPath,
            });

            let bufferOutData = "";

            foo.stdout.on("data", (dataArg: any) => {
              console.log("stdout: " + dataArg);
              bufferOutData += dataArg;
            });

            foo.stderr.on("data", (data: any) => {
              console.log("stderr: " + data);
            });

            foo.stdin.on("data", (data: any) => {
              console.log("stdin: " + data);
            });

            foo.on("exit", (code, _signal) => {
              console.log("exit code " + code);
              console.log("bufferOutData " + bufferOutData);
              try {
                const data = JSON.parse(bufferOutData);
                const folderNames = [];
                const results = data.result;

                if (!results || results.length == 0) {
                  //no folders
                  this._panel.webview.postMessage({
                    command: "listmetadata",
                    results: results,
                    metadataType: mType,
                  });
                  resolve(undefined);
                  return;
                } else if (!Array.isArray(results)) {
                  //1 folder
                  folderNames.push(results.fullName);
                } else {
                  //many folders
                  for (let i = 0; i < results.length; i++) {
                    folderNames.push(results[i].fullName);
                  }
                }

                //get the components inside each folder
                this.getComponentsInsideFolders(folderNames, mType, 0, []);
              } catch (e) {
                console.error(
                  "Error parsing list metadata output for folder type " +
                    folderType +
                    ": " +
                    e,
                );
                vscode.window.showErrorMessage(
                  "Error fetching folder metadata. Make sure your SF CLI is authenticated and up to date.",
                );
                this._panel.webview.postMessage({
                  command: "listmetadata",
                  results: [],
                  metadataType: mType,
                });
              }
              resolve(undefined);
            });
          });

          return p;
        },
      );
    }
  }

  public fetchAllChildren(selectedMetadata, skippedMetadataTypes, index) {
    console.log("Invoked fetchAllChildren");
    if (!selectedMetadata || selectedMetadata.length == 0) {
      return;
    }

    if (index == selectedMetadata.length) {
      //end condition
      const mpKeys = [];
      for (const key in this.reportFolderMap) {
        mpKeys.push(key);
      }
      vscode.window.showInformationMessage(
        this.infoMsg + skippedMetadataTypes.join(),
      ); //Modified for #18
      return;
    }

    const mType = selectedMetadata[index];

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Processing Metadata : " + mType,
        cancellable: true,
      },
      (progress, token) => {
        token.onCancellationRequested(() => {
          console.log("User canceled the long running operation");
        });

        const p = new Promise((resolve) => {
          const sfCmd =
            "sf org list metadata --metadata-type " +
            mType +
            " --api-version " +
            this.VERSION_NUM +
            " --json";
          const foo: child.ChildProcess = child.exec(sfCmd, {
            cwd: vscode.workspace.workspaceFolders[0].uri.fsPath,
          });

          let bufferOutData = "";

          foo.stdout.on("data", (dataArg: any) => {
            console.log("stdout: " + dataArg);
            bufferOutData += dataArg;
          });

          foo.stderr.on("data", (data: any) => {
            console.log("stderr: " + data);
          });

          foo.stdin.on("data", (data: any) => {
            console.log("stdin: " + data);
          });

          foo.on("exit", (code, _signal) => {
            console.log("exit code " + code);
            console.log("bufferOutData " + bufferOutData);
            try {
              const data = JSON.parse(bufferOutData);
              const results = data.result;
              this._panel.webview.postMessage({
                command: "listmetadata",
                results: results,
                metadataType: mType,
              });
            } catch (e) {
              console.error(
                "Error parsing list metadata output for " + mType + ": " + e,
              );
              this._panel.webview.postMessage({
                command: "listmetadata",
                results: [],
                metadataType: mType,
              });
            }
            resolve(undefined);
            this.fetchAllChildren(
              selectedMetadata,
              skippedMetadataTypes,
              ++index,
            ); //recurse through other metadata
          });
        });

        return p;
      },
    );
  }
  public getComponentsInsideFolders(folderNames, mType, index, resultsArr) {
    if (index == folderNames.length) {
      // Cache the combined folder results
      this.cacheChildrenResults(mType, resultsArr);
      this._panel.webview.postMessage({
        command: "listmetadata",
        results: resultsArr,
        metadataType: mType,
      });
      return;
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Processing Metadata : " + mType + ":" + folderNames[index],
        cancellable: true,
      },
      (progress, token) => {
        token.onCancellationRequested(() => {
          console.log("User canceled the long running operation");
        });

        const p = new Promise((resolve) => {
          const sfCmd =
            "sf org list metadata --metadata-type " +
            mType +
            " --folder " +
            folderNames[index] +
            " --api-version " +
            this.VERSION_NUM +
            " --json";
          const foo: child.ChildProcess = child.exec(sfCmd, {
            maxBuffer: 1024 * 1024 * 6,
            cwd: vscode.workspace.workspaceFolders[0].uri.fsPath,
          });

          let bufferOutData = "";

          foo.stdout.on("data", (dataArg: any) => {
            console.log("stdout: " + dataArg);
            bufferOutData += dataArg;
          });

          foo.stderr.on("data", (data: any) => {
            console.log("stderr: " + data);
          });

          foo.stdin.on("data", (data: any) => {
            console.log("stdin: " + data);
          });

          foo.on("exit", (code, _signal) => {
            console.log("exit code " + code);
            console.log("bufferOutData " + bufferOutData);
            try {
              const data = JSON.parse(bufferOutData);
              const results = data.result;

              if (results) {
                if (!Array.isArray(results)) {
                  //1 folder
                  resultsArr.push(results);
                } else {
                  //many folders
                  for (let i = 0; i < results.length; i++) {
                    resultsArr.push(results[i]);
                  }
                }
              }
            } catch (e) {
              console.error(
                "Error parsing list metadata output for folder " +
                  folderNames[index] +
                  ": " +
                  e,
              );
            }

            resolve(undefined);
            console.log("After resolve getComponentsInsideFolders");
            this.getComponentsInsideFolders(
              folderNames,
              mType,
              ++index,
              resultsArr,
            );
          });
        });

        return p;
      },
    );
  }

  private cacheChildrenResults(mType: string, results: any): void {
    try {
      const cache = CodingPanel.readCache() || {
        apiVersion: this.VERSION_NUM,
        children: {},
      };
      if (!cache.children) {
        cache.children = {};
      }
      cache.children[mType] = results;
      CodingPanel.writeCache(cache);
    } catch (e) {
      console.error("Error caching children for " + mType + ": " + e);
    }
  }

  public dispose() {
    CodingPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    this._panel.title = "Choose Metadata Components";
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private handleInitLoadRequest() {
    const cache = CodingPanel.readCache();
    if (
      cache &&
      cache.metadataObjects &&
      cache.apiVersion === this.VERSION_NUM
    ) {
      console.log("Loading metadata types from cache");
      this.readExistingPackageXML()
        .then((mpExistingPackageXML) => {
          this._panel.webview.postMessage({
            command: "metadataObjects",
            metadataObjects: cache.metadataObjects,
            mpExistingPackageXML: mpExistingPackageXML,
            fromCache: true,
            cacheTimestamp: cache.timestamp,
          });
        })
        .catch((err) => {
          console.log(err);
        });
    } else {
      this.readExistingPackageXML()
        .then((mpExistingPackageXML) => {
          this.getMetadataTypes(mpExistingPackageXML);
        })
        .catch((err) => {
          console.log(err);
        });
    }
  }

  private handleUpdatePackageXml(metadataTypes) {
    const mpPackage = this.buildSelectedMetadataMap(metadataTypes);
    if (mpPackage.size == 0) {
      vscode.window.showErrorMessage(
        "Please select components for package.xml",
      );
      return;
    }
    this.generatePackageXML(mpPackage, false);
  }

  private handleCopyToClipboard(metadataTypes) {
    const mpPackage = this.buildSelectedMetadataMap(metadataTypes);
    if (mpPackage.size == 0) {
      vscode.window.showErrorMessage(
        "Please select components for package.xml",
      );
      return;
    }
    this.generatePackageXML(mpPackage, true);
  }

  private openUrl(url) {
    vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(url));
  }

  private buildSelectedMetadataMap(metadataTypes) {
    return buildSelectedMetadataMap(metadataTypes);
  }

  private readExistingPackageXML() {
    console.log("Read existing packge.xml");
    const mpExistingPackageXML = {};
    const parser = new xml2js.Parser();

    return new Promise((resolve, _reject) => {
      fs.readFile(
        vscode.workspace.workspaceFolders[0].uri.fsPath +
          "/manifest/package.xml",
        function (err, data) {
          if (err) {
            console.error(err);
            resolve(mpExistingPackageXML);
          }
          parser.parseString(data, function (err, result) {
            if (err) {
              console.error(err);
              resolve(mpExistingPackageXML);
            }
            console.log("Existing package.xml");
            console.log(JSON.stringify(result));
            if (!result || !result.Package || !result.Package.types) {
              resolve(mpExistingPackageXML);
            }

            const types = result.Package.types;
            for (let i = 0; i < types.length; i++) {
              const type = types[i];

              const name = type.name[0];
              const members = type.members;
              mpExistingPackageXML[name] = members;
            }

            console.log(mpExistingPackageXML);

            resolve(mpExistingPackageXML);
          });
        },
      );
    });
  }

  private getMetadataTypes(mpExistingPackageXML) {
    console.log("getMetadataTypes invoked");
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Processing Metadata",
        cancellable: true,
      },
      (progress, token) => {
        token.onCancellationRequested(() => {
          console.log("User canceled the long running operation");
        });

        console.log(
          "vscode.workspace.workspaceFolders[0].uri.fsPath " +
            vscode.workspace.workspaceFolders[0].uri.fsPath,
        );

        const p = new Promise((resolve) => {
          const foo: child.ChildProcess = child.exec(
            "sf org list metadata-types --api-version " +
              this.VERSION_NUM +
              " --json",
            {
              maxBuffer: 1024 * 1024 * 6,
              cwd: vscode.workspace.workspaceFolders[0].uri.fsPath,
            },
          );
          let bufferOutData = "";
          let stderrData = "";
          foo.stdout.on("data", (dataArg: any) => {
            console.log("dataArg " + dataArg);
            bufferOutData += dataArg;
          });

          foo.stderr.on("data", (data: any) => {
            console.log("stderr: " + data);
            stderrData += data;
          });

          foo.stdin.on("data", (data: any) => {
            console.log("stdin: " + data);
          });

          foo.on("error", (err: any) => {
            console.error("Failed to start sf command: " + err);
            vscode.window.showErrorMessage(
              "Failed to run SF CLI. Make sure 'sf' is installed and available in your PATH. Error: " +
                err.message,
            );
            resolve(undefined);
          });

          foo.on("exit", (code: number, _signal: string) => {
            console.log("exited with code " + code);
            console.log("bufferOutData " + bufferOutData);
            if (code !== 0) {
              console.error("sf command exited with code " + code);
              console.error("stderr: " + stderrData);
            }
            try {
              const data = JSON.parse(bufferOutData);
              const depArr = [];
              let metadataObjectsArr = data.result.metadataObjects;

              // Filter out metadata types that are deprecated or non-retrievable
              metadataObjectsArr = metadataObjectsArr.filter((obj: any) => {
                if (NON_RETRIEVABLE_TYPES.has(obj.xmlName)) {
                  console.log(
                    "Filtering out non-retrievable type: " + obj.xmlName,
                  );
                  return false;
                }
                return true;
              });

              for (let index = 0; index < metadataObjectsArr.length; index++) {
                const obj = metadataObjectsArr[index];
                console.log(obj.xmlName);
                depArr.push(obj.xmlName);
              }
              // Write metadata types to cache
              const cache = CodingPanel.readCache() || {};
              cache.apiVersion = this.VERSION_NUM;
              cache.metadataObjects = metadataObjectsArr;
              if (!cache.children) {
                cache.children = {};
              }
              CodingPanel.writeCache(cache);

              this._panel.webview.postMessage({
                command: "metadataObjects",
                metadataObjects: metadataObjectsArr,
                mpExistingPackageXML: mpExistingPackageXML,
              });
            } catch (e) {
              console.error("Error parsing metadata types output: " + e);
              console.error("stdout was: " + bufferOutData);
              console.error("stderr was: " + stderrData);
              let errorDetail = "";
              if (!bufferOutData || bufferOutData.trim() === "") {
                errorDetail =
                  "No output received from SF CLI. Make sure 'sf' is installed and in your PATH.";
              } else if (stderrData) {
                errorDetail = stderrData.substring(0, 200);
              } else {
                errorDetail = String(e);
              }
              vscode.window.showErrorMessage(
                "Error fetching metadata types: " + errorDetail,
              );
            }
            resolve(undefined);
          });
          console.log(typeof foo.on);
        });

        return p;
      },
    );
  }
  private _getHtmlForWebview() {
    // Local path to main script run in the webview
    const scriptPathOnDisk = vscode.Uri.file(
      path.join(this._extensionPath, "resources", "webview.js"),
    );
    const scriptUri = this._panel.webview.asWebviewUri(scriptPathOnDisk);

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>Package.xml Generator</title>
	<style>
		:root {
			--border-color: var(--vscode-panel-border, var(--vscode-widget-border, rgba(128,128,128,0.35)));
			--hover-bg: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
			--active-bg: var(--vscode-list-activeSelectionBackground, #094771);
			--active-fg: var(--vscode-list-activeSelectionForeground, #fff);
			--focus-border: var(--vscode-focusBorder, #007fd4);
			--badge-bg: var(--vscode-badge-background, #4d4d4d);
			--badge-fg: var(--vscode-badge-foreground, #fff);
			--input-bg: var(--vscode-input-background, #3c3c3c);
			--input-fg: var(--vscode-input-foreground, #ccc);
			--input-border: var(--vscode-input-border, transparent);
			--button-bg: var(--vscode-button-background, #0e639c);
			--button-fg: var(--vscode-button-foreground, #fff);
			--button-hover-bg: var(--vscode-button-hoverBackground, #1177bb);
			--button-secondary-bg: var(--vscode-button-secondaryBackground, #3a3d41);
			--button-secondary-fg: var(--vscode-button-secondaryForeground, #fff);
			--button-secondary-hover-bg: var(--vscode-button-secondaryHoverBackground, #45494e);
			--checkbox-bg: var(--vscode-checkbox-background, #3c3c3c);
			--checkbox-border: var(--vscode-checkbox-border, #3c3c3c);
			--checkbox-fg: var(--vscode-checkbox-foreground, #f0f0f0);
			--progress-bg: var(--vscode-progressBar-background, #0e70c0);
		}

		* { box-sizing: border-box; margin: 0; padding: 0; }

		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
			font-size: var(--vscode-font-size, 13px);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			line-height: 1.4;
			overflow-x: hidden;
		}

		/* ── Toolbar ── */
		.toolbar {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 10px 16px;
			background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
			border-bottom: 1px solid var(--border-color);
			position: sticky;
			top: 0;
			z-index: 10;
			flex-wrap: wrap;
		}
		.toolbar-title {
			font-size: 14px;
			font-weight: 600;
			margin-right: auto;
			white-space: nowrap;
			color: var(--vscode-foreground);
		}
		.toolbar-title .codicon { margin-right: 6px; }
		.btn {
			display: inline-flex;
			align-items: center;
			gap: 5px;
			padding: 5px 12px;
			border: none;
			border-radius: 2px;
			font-size: 12px;
			font-family: inherit;
			cursor: pointer;
			white-space: nowrap;
			transition: background 0.1s;
		}
		.btn-primary {
			background: var(--button-bg);
			color: var(--button-fg);
		}
		.btn-primary:hover { background: var(--button-hover-bg); }
		.btn-secondary {
			background: var(--button-secondary-bg);
			color: var(--button-secondary-fg);
		}
		.btn-secondary:hover { background: var(--button-secondary-hover-bg); }
		.btn svg { width: 14px; height: 14px; fill: currentColor; }

		/* ── Search ── */
		.search-box {
			width: 100%;
			padding: 6px 10px 6px 30px;
			border: 1px solid var(--input-border);
			border-radius: 2px;
			background: var(--input-bg);
			color: var(--input-fg);
			font-size: 13px;
			font-family: inherit;
			outline: none;
		}
		.search-box:focus { border-color: var(--focus-border); }
		.search-wrap {
			position: relative;
			padding: 8px 12px;
		}
		.search-wrap svg {
			position: absolute;
			left: 20px;
			top: 50%;
			transform: translateY(-50%);
			width: 14px;
			height: 14px;
			fill: var(--vscode-input-placeholderForeground, #888);
			pointer-events: none;
		}

		/* ── Layout ── */
		.panels {
			display: grid;
			grid-template-columns: 1fr 1fr;
			height: calc(100vh - 52px);
			overflow: hidden;
		}
		.panel {
			display: flex;
			flex-direction: column;
			overflow: hidden;
			border-right: 1px solid var(--border-color);
		}
		.panel:last-child { border-right: none; }
		.panel-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 8px 12px;
			border-bottom: 1px solid var(--border-color);
			background: var(--vscode-sideBarSectionHeader-background, transparent);
			font-weight: 600;
			font-size: 12px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			flex-shrink: 0;
		}
		.panel-header-actions { display: flex; gap: 4px; }
		.panel-header-actions .btn {
			padding: 2px 8px;
			font-size: 11px;
			text-transform: none;
			letter-spacing: 0;
			font-weight: 400;
		}
		.panel-body {
			flex: 1;
			overflow-y: auto;
			overflow-x: hidden;
		}

		/* ── Metadata list ── */
		.meta-item {
			display: flex;
			align-items: center;
			padding: 4px 12px;
			cursor: pointer;
			user-select: none;
			border-left: 3px solid transparent;
			gap: 6px;
			min-height: 28px;
			transition: background 0.05s;
		}
		.meta-item:hover { background: var(--hover-bg); }
		.meta-item.selected {
			background: var(--active-bg);
			color: var(--active-fg);
			border-left-color: var(--focus-border);
		}
		.meta-item input[type="checkbox"] {
			accent-color: var(--button-bg);
			width: 15px;
			height: 15px;
			flex-shrink: 0;
			cursor: pointer;
		}
		.meta-item-label {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 13px;
		}
		.meta-item-badge {
			background: var(--badge-bg);
			color: var(--badge-fg);
			font-size: 10px;
			padding: 1px 6px;
			border-radius: 8px;
			flex-shrink: 0;
		}
		.meta-item-arrow {
			flex-shrink: 0;
			width: 16px;
			height: 16px;
			fill: var(--vscode-foreground);
			opacity: 0.5;
		}

		/* ── Component list ── */
		.comp-item {
			display: flex;
			align-items: center;
			padding: 3px 12px;
			gap: 6px;
			min-height: 26px;
			cursor: pointer;
			user-select: none;
		}
		.comp-item:hover { background: var(--hover-bg); }
		.comp-item input[type="checkbox"] {
			accent-color: var(--button-bg);
			width: 15px;
			height: 15px;
			flex-shrink: 0;
			cursor: pointer;
		}
		.comp-item-label {
			flex: 1;
			font-size: 13px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		/* ── States ── */
		.empty-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			opacity: 0.5;
			gap: 8px;
			padding: 24px;
			text-align: center;
		}
		.empty-state svg { width: 48px; height: 48px; fill: currentColor; opacity: 0.3; }

		.loading-bar {
			height: 2px;
			background: var(--progress-bg);
			animation: loading 1.5s ease-in-out infinite;
			border-radius: 1px;
		}
		@keyframes loading {
			0% { width: 0%; margin-left: 0; }
			50% { width: 60%; margin-left: 20%; }
			100% { width: 0%; margin-left: 100%; }
		}

		.status-bar {
			padding: 4px 12px;
			font-size: 11px;
			border-top: 1px solid var(--border-color);
			background: var(--vscode-statusBar-background, transparent);
			color: var(--vscode-statusBar-foreground, var(--vscode-foreground));
			display: flex;
			justify-content: space-between;
			flex-shrink: 0;
		}

		/* ── Scrollbar ── */
		.panel-body::-webkit-scrollbar { width: 8px; }
		.panel-body::-webkit-scrollbar-track { background: transparent; }
		.panel-body::-webkit-scrollbar-thumb {
			background: var(--vscode-scrollbarSlider-background, rgba(100,100,100,0.4));
			border-radius: 4px;
		}
		.panel-body::-webkit-scrollbar-thumb:hover {
			background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.7));
		}
	</style>
</head>
<body>

	<!-- Toolbar -->
	<div class="toolbar">
		<span class="toolbar-title">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:text-bottom;margin-right:6px"><path d="M13.5 1H2.5C1.67 1 1 1.67 1 2.5v11c0 .83.67 1.5 1.5 1.5h11c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zM2.5 2h11c.28 0 .5.22.5.5V5H2V2.5c0-.28.22-.5.5-.5zM2 13.5V6h12v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5z"/><rect x="3" y="3" width="3" height="1" rx="0.5"/></svg>
			Package.xml Generator
		</span>
		<button class="btn btn-primary" id="btnUpdatePkg" title="Write to manifest/package.xml">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M13.71 4.29l-3-3L10 1H4L3 2v12l1 1h8l1-1V5l-.29-.71zM13 14H3V2h6v4h4v8zm-1-9l-3-3v3h3z"/></svg>
			Update Package.xml
		</button>
		<button class="btn btn-secondary" id="btnCopy" title="Copy XML to clipboard">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.414l-1-1H3z"/></svg>
			Copy to Clipboard
		</button>
		<button class="btn btn-secondary" id="btnRefresh" title="Clear cache and re-fetch metadata from org">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M13.451 5.609l-.579-.939-1.068.812-.076.094c-.335.415-.927 1.146-1.545 2.071l-.088.141.894.572.082-.131c.315-.497.637-.96.917-1.35a5 5 0 11-4.004-2.065l-.023.634-.003.087.073.043 2.688 1.586.066.039.063-.044 2.465-1.726.068-.048-.038-.07-.949-1.742-.062-.113-.098.071-.669.491A5.992 5.992 0 008 2a6 6 0 106 6h-1a5 5 0 01-.549-2.391z"/></svg>
			Refresh
		</button>
		<span id="cacheStatus" style="font-size:11px;opacity:0.6;margin-left:4px"></span>
	</div>

	<!-- Panels -->
	<div class="panels">
		<!-- Left: Metadata Types -->
		<div class="panel">
			<div class="panel-header">
				<span>Metadata Types <span id="metaCount" class="meta-item-badge" style="margin-left:4px">0</span></span>
				<div class="panel-header-actions">
					<button class="btn btn-secondary" id="btnSelectAll">Select All</button>
					<button class="btn btn-secondary" id="btnClearAll">Clear All</button>
				</div>
			</div>
			<div class="search-wrap">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M15.25 13.836l-3.965-3.965A5.5 5.5 0 1 0 6.5 12a5.474 5.474 0 0 0 3.371-1.165l3.965 3.965.707-.707-.293-.257zM6.5 11A4.5 4.5 0 1 1 11 6.5 4.505 4.505 0 0 1 6.5 11z"/></svg>
				<input type="text" class="search-box" id="metaSearch" placeholder="Filter metadata types…" />
			</div>
			<div class="panel-body" id="metaList"></div>
			<div class="status-bar" id="metaStatus">Loading metadata types…</div>
		</div>

		<!-- Right: Components -->
		<div class="panel">
			<div class="panel-header">
				<span id="compTitle">Components</span>
				<div class="panel-header-actions">
					<button class="btn btn-secondary" id="btnCompSelectAll">Select All</button>
					<button class="btn btn-secondary" id="btnCompClearAll">Clear All</button>
				</div>
			</div>
			<div class="search-wrap">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M15.25 13.836l-3.965-3.965A5.5 5.5 0 1 0 6.5 12a5.474 5.474 0 0 0 3.371-1.165l3.965 3.965.707-.707-.293-.257zM6.5 11A4.5 4.5 0 1 1 11 6.5 4.505 4.505 0 0 1 6.5 11z"/></svg>
				<input type="text" class="search-box" id="compSearch" placeholder="Filter components…" />
			</div>
			<div class="panel-body" id="compList">
				<div class="empty-state">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M14 1H5l-1 1v3h1V2.5l.5-.5h8l.5.5v11l-.5.5H5.5l-.5-.5V13H4v1l1 1h9l1-1V2l-1-1z"/><path d="M3.5 6h7v1h-7zM3.5 9h7v1h-7zM3.5 12h4v1h-4z"/></svg>
					<span>Select a metadata type to view its components</span>
				</div>
			</div>
			<div class="status-bar" id="compStatus">&nbsp;</div>
		</div>
	</div>

	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
