// Package.xml Generator — Webview Script
// Vanilla JS, no dependencies. Communicates with the extension via postMessage.
(function () {
	"use strict";

	const vscode = acquireVsCodeApi();

	// ── State ──
	let metadataTypes = []; // [{id, text, children:[], inFolder, isChildXMLName, isSelected, isIndeterminate, isRefreshedFromServer}]
	let selectedTypeId = null; // currently highlighted metadata type id

	// ── DOM refs ──
	const $metaList = document.getElementById("metaList");
	const $metaSearch = document.getElementById("metaSearch");
	const $metaCount = document.getElementById("metaCount");
	const $metaStatus = document.getElementById("metaStatus");
	const $compList = document.getElementById("compList");
	const $compSearch = document.getElementById("compSearch");
	const $compTitle = document.getElementById("compTitle");
	const $compStatus = document.getElementById("compStatus");
	const $btnUpdatePkg = document.getElementById("btnUpdatePkg");
	const $btnCopy = document.getElementById("btnCopy");
	const $btnRefresh = document.getElementById("btnRefresh");
	const $cacheStatus = document.getElementById("cacheStatus");
	const $btnSelectAll = document.getElementById("btnSelectAll");
	const $btnClearAll = document.getElementById("btnClearAll");
	const $btnCompSelectAll = document.getElementById("btnCompSelectAll");
	const $btnCompClearAll = document.getElementById("btnCompClearAll");

	// ── Init ──
	vscode.postMessage({ command: "INIT_LOAD_REQUEST" });

	// ── Render: Metadata Types (left panel) ──
	function renderMetaList() {
		const filter = ($metaSearch.value || "").toUpperCase();
		const fragment = document.createDocumentFragment();
		let visibleCount = 0;

		for (const mt of metadataTypes) {
			if (filter && !mt.id.toUpperCase().includes(filter)) continue;
			visibleCount++;

			const row = document.createElement("div");
			row.className = "meta-item" + (mt.id === selectedTypeId ? " selected" : "");
			row.dataset.id = mt.id;

			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = mt.isSelected;
			cb.indeterminate = mt.isIndeterminate;
			cb.addEventListener("click", (e) => {
				e.stopPropagation();
				mt.isSelected = cb.checked;
				mt.isIndeterminate = false;
				// update children
				mt.children.forEach((c) => (c.isSelected = mt.isSelected));
				// fetch if needed
				if (!mt.isRefreshedFromServer) {
					vscode.postMessage({ command: "FETCH_CHILDREN_REQUEST", metadataType: mt });
				}
				selectType(mt.id);
				renderMetaList();
				renderCompList();
			});

			const label = document.createElement("span");
			label.className = "meta-item-label";
			label.textContent = mt.id;

			row.appendChild(cb);
			row.appendChild(label);

			// child count badge
			if (mt.children.length > 0) {
				const badge = document.createElement("span");
				badge.className = "meta-item-badge";
				badge.textContent = mt.children.length;
				row.appendChild(badge);
			}

			// arrow
			const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			arrow.setAttribute("viewBox", "0 0 16 16");
			arrow.classList.add("meta-item-arrow");
			const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
			arrowPath.setAttribute("d", "M5.7 13.7L5 13l5-5-5-5 .7-.7L11.4 8z");
			arrow.appendChild(arrowPath);
			row.appendChild(arrow);

			row.addEventListener("click", () => {
				selectType(mt.id);
				if (!mt.isRefreshedFromServer) {
					vscode.postMessage({ command: "FETCH_CHILDREN_REQUEST", metadataType: mt });
				}
				renderMetaList();
				renderCompList();
			});

			fragment.appendChild(row);
		}

		$metaList.innerHTML = "";
		if (visibleCount === 0 && metadataTypes.length > 0) {
			$metaList.innerHTML =
				'<div class="empty-state"><span>No matching metadata types</span></div>';
		} else if (metadataTypes.length === 0) {
			$metaList.innerHTML =
				'<div class="empty-state"><div class="loading-bar" style="width:60%;margin:0 auto"></div><span style="margin-top:12px">Loading metadata types…</span></div>';
		} else {
			$metaList.appendChild(fragment);
		}

		$metaCount.textContent = metadataTypes.length;
		updateMetaStatus();
	}

	// ── Render: Components (right panel) ──
	function renderCompList() {
		const mt = metadataTypes.find((m) => m.id === selectedTypeId);
		if (!mt) {
			$compList.innerHTML =
				'<div class="empty-state">' +
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M14 1H5l-1 1v3h1V2.5l.5-.5h8l.5.5v11l-.5.5H5.5l-.5-.5V13H4v1l1 1h9l1-1V2l-1-1z"/><path d="M3.5 6h7v1h-7zM3.5 9h7v1h-7zM3.5 12h4v1h-4z"/></svg>' +
				"<span>Select a metadata type to view its components</span>" +
				"</div>";
			$compTitle.textContent = "Components";
			$compStatus.innerHTML = "&nbsp;";
			return;
		}

		$compTitle.textContent = mt.text || mt.id;
		const filter = ($compSearch.value || "").toUpperCase();
		const fragment = document.createDocumentFragment();
		let visibleCount = 0;

		if (mt.children.length === 0 && !mt.isRefreshedFromServer) {
			$compList.innerHTML =
				'<div class="empty-state"><div class="loading-bar" style="width:50%;margin:0 auto"></div><span style="margin-top:12px">Fetching components…</span></div>';
			$compStatus.textContent = "Loading…";
			return;
		}

		for (const child of mt.children) {
			if (filter && !child.text.toUpperCase().includes(filter)) continue;
			visibleCount++;

			const row = document.createElement("div");
			row.className = "comp-item";

			const cb = document.createElement("input");
			cb.type = "checkbox";
			cb.checked = child.isSelected;
			cb.addEventListener("click", (e) => {
				e.stopPropagation();
				child.isSelected = cb.checked;
				updateParentState(mt);
				renderMetaList();
				updateCompStatus(mt);
			});

			const label = document.createElement("span");
			label.className = "comp-item-label";
			label.textContent = child.text;

			row.appendChild(cb);
			row.appendChild(label);

			row.addEventListener("click", () => {
				child.isSelected = !child.isSelected;
				cb.checked = child.isSelected;
				updateParentState(mt);
				renderMetaList();
				updateCompStatus(mt);
			});

			fragment.appendChild(row);
		}

		$compList.innerHTML = "";
		if (visibleCount === 0 && mt.children.length > 0) {
			$compList.innerHTML = '<div class="empty-state"><span>No matching components</span></div>';
		} else if (mt.children.length === 0) {
			$compList.innerHTML = '<div class="empty-state"><span>No components found</span></div>';
		} else {
			$compList.appendChild(fragment);
		}

		updateCompStatus(mt);
	}

	function selectType(id) {
		selectedTypeId = id;
		$compSearch.value = "";
	}

	function updateParentState(mt) {
		if (mt.children.length === 0) return;
		const selCount = mt.children.filter((c) => c.isSelected).length;
		if (selCount === 0) {
			mt.isSelected = false;
			mt.isIndeterminate = false;
		} else if (selCount === mt.children.length) {
			mt.isSelected = true;
			mt.isIndeterminate = false;
		} else {
			mt.isSelected = false;
			mt.isIndeterminate = true;
		}
	}

	function updateMetaStatus() {
		const selected = metadataTypes.filter((m) => m.isSelected || m.isIndeterminate).length;
		$metaStatus.textContent =
			metadataTypes.length > 0
				? selected + " of " + metadataTypes.length + " types selected"
				: "Loading metadata types…";
	}

	function updateCompStatus(mt) {
		if (!mt) {
			$compStatus.innerHTML = "&nbsp;";
			return;
		}
		const selCount = mt.children.filter((c) => c.isSelected).length;
		$compStatus.textContent = selCount + " of " + mt.children.length + " components selected";
	}

	// ── Message handling from extension ──
	window.addEventListener("message", function (event) {
		var msg = event.data;
		switch (msg.command) {
			case "metadataObjects": {
				var objs = processChildXMLNames(msg.metadataObjects);
				var existing = msg.mpExistingPackageXML || {};
				// Display cache status
				if (msg.fromCache && msg.cacheTimestamp) {
					var cacheDate = new Date(msg.cacheTimestamp);
					var now = new Date();
					var diffMin = Math.round((now.getTime() - cacheDate.getTime()) / 60000);
					var ageText = diffMin < 60 ? diffMin + "m ago" : Math.round(diffMin / 60) + "h ago";
					$cacheStatus.textContent = "⚡ Cached (" + ageText + ")";
					$cacheStatus.title = "Loaded from cache. Last refreshed: " + cacheDate.toLocaleString();
				} else {
					$cacheStatus.textContent = "";
				}
				objs.sort(function (a, b) {
					return a.xmlName.localeCompare(b.xmlName);
				});
				metadataTypes = objs.map(function (obj) {
					var xmlName = obj.xmlName;
					var isChild = obj.isChildXMLName || false;
					if (existing[xmlName]) {
						var members = existing[xmlName];
						var isWild = members.indexOf("*") !== -1;
						var children = members
							.filter(function (m) {
								return m !== "*";
							})
							.map(function (m) {
								return { id: xmlName + "." + m, text: m, isSelected: true };
							});
						return {
							id: xmlName,
							text: xmlName,
							children: children,
							inFolder: obj.inFolder,
							isChildXMLName: isChild,
							isRefreshedFromServer: false,
							isParent: true,
							isSelected: isWild,
							isIndeterminate: !isWild && children.length > 0,
						};
					}
					return {
						id: xmlName,
						text: xmlName,
						children: [],
						inFolder: obj.inFolder,
						isChildXMLName: isChild,
						isRefreshedFromServer: false,
						isParent: true,
						isSelected: false,
						isIndeterminate: false,
					};
				});
				renderMetaList();
				renderCompList();
				break;
			}
			case "listmetadata": {
				var results = msg.results;
				var mtId = msg.metadataType;
				var childrenArr = [];
				if (results && !Array.isArray(results)) {
					childrenArr.push({
						id: mtId + "." + results.fullName,
						text: results.fullName,
						isSelected: false,
					});
				} else if (results && results.length > 0) {
					childrenArr = results.map(function (r) {
						return { id: mtId + "." + r.fullName, text: r.fullName, isSelected: false };
					});
				}
				childrenArr.sort(function (a, b) {
					return a.text.localeCompare(b.text);
				});

				var mt = metadataTypes.find(function (m) {
					return m.id === mtId;
				});
				if (mt) {
					var isParSel = mt.isSelected;
					var oldChildren = mt.children;
					mt.isRefreshedFromServer = true;
					mt.children = childrenArr.map(function (child) {
						if (isParSel) {
							child.isSelected = true;
						} else {
							var old = oldChildren.find(function (o) {
								return o.id === child.id;
							});
							child.isSelected = old ? old.isSelected : false;
						}
						return child;
					});
					// recalculate parent state
					if (childrenArr.length > 0) {
						var selCount = mt.children.filter(function (c) {
							return c.isSelected;
						}).length;
						if (selCount === mt.children.length) {
							mt.isSelected = true;
							mt.isIndeterminate = false;
						} else if (selCount > 0) {
							mt.isSelected = false;
							mt.isIndeterminate = true;
						}
					}
				}
				renderMetaList();
				if (selectedTypeId === mtId) renderCompList();
				break;
			}
		}
	});

	function processChildXMLNames(objs) {
		var combined = [];
		for (var i = 0; i < objs.length; i++) {
			combined.push(objs[i]);
			if (objs[i].childXmlNames) {
				for (var j = 0; j < objs[i].childXmlNames.length; j++) {
					combined.push({
						xmlName: objs[i].childXmlNames[j],
						inFolder: false,
						isChildXMLName: true,
					});
				}
			}
		}
		return combined;
	}

	// ── Toolbar buttons ──
	$btnUpdatePkg.addEventListener("click", function () {
		vscode.postMessage({ command: "UPDATE_PACKAGE_XML", metadataTypes: metadataTypes });
	});

	$btnCopy.addEventListener("click", function () {
		vscode.postMessage({ command: "COPY_TO_CLIPBOARD", metadataTypes: metadataTypes });
	});

	$btnRefresh.addEventListener("click", function () {
		metadataTypes = [];
		selectedTypeId = null;
		$cacheStatus.textContent = "";
		renderMetaList();
		renderCompList();
		vscode.postMessage({ command: "REFRESH_CACHE" });
	});

	$btnSelectAll.addEventListener("click", function () {
		var parNodeArr = [];
		var skippedMetadataTypes = [];
		for (var i = 0; i < metadataTypes.length; i++) {
			var mt = metadataTypes[i];
			if (!mt.inFolder && !mt.isChildXMLName) {
				parNodeArr.push(mt.id);
				mt.isSelected = true;
				mt.isIndeterminate = false;
				mt.children.forEach(function (c) {
					c.isSelected = true;
				});
			} else {
				skippedMetadataTypes.push(mt.id);
			}
		}
		parNodeArr.sort();
		vscode.postMessage({
			command: "selectAll",
			selectedMetadata: parNodeArr,
			skippedMetadataTypes: skippedMetadataTypes,
		});
		renderMetaList();
		renderCompList();
	});

	$btnClearAll.addEventListener("click", function () {
		selectedTypeId = null;
		for (var i = 0; i < metadataTypes.length; i++) {
			metadataTypes[i].isRefreshedFromServer = false;
			metadataTypes[i].children = [];
			metadataTypes[i].isSelected = false;
			metadataTypes[i].isIndeterminate = false;
		}
		renderMetaList();
		renderCompList();
	});

	$btnCompSelectAll.addEventListener("click", function () {
		var mt = metadataTypes.find(function (m) {
			return m.id === selectedTypeId;
		});
		if (!mt) return;
		mt.children.forEach(function (c) {
			c.isSelected = true;
		});
		mt.isSelected = true;
		mt.isIndeterminate = false;
		renderMetaList();
		renderCompList();
	});

	$btnCompClearAll.addEventListener("click", function () {
		var mt = metadataTypes.find(function (m) {
			return m.id === selectedTypeId;
		});
		if (!mt) return;
		mt.children.forEach(function (c) {
			c.isSelected = false;
		});
		mt.isSelected = false;
		mt.isIndeterminate = false;
		renderMetaList();
		renderCompList();
	});

	// ── Search inputs ──
	$metaSearch.addEventListener("input", function () {
		renderMetaList();
	});
	$compSearch.addEventListener("input", function () {
		renderCompList();
	});
})();
