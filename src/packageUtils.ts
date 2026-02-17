/**
 * Pure utility functions for building Package.xml content.
 * Extracted from extension.ts so they can be unit-tested without the VS Code runtime.
 */

// ── Constants ──

export const FALLBACK_API_VERSION = "62.0";

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Metadata types that accept the wildcard `*` member. */
export const WILDCARD_TYPES = new Set([
  "AccountRelationshipShareRule",
  "ActionLinkGroupTemplate",
  "ActionPlanTemplate",
  "AnimationRule",
  "ApexClass",
  "ApexComponent",
  "ApexPage",
  "ApexTestSuite",
  "ApexTrigger",
  "AppMenu",
  "AppointmentSchedulingPolicy",
  "ApprovalProcess",
  "AssignmentRules",
  "Audience",
  "AuthProvider",
  "AuraDefinitionBundle",
  "AutoResponseRules",
  "Bot",
  "BrandingSet",
  "CallCenter",
  "CampaignInfluenceModel",
  "Certificate",
  "ChannelLayout",
  "ChatterExtension",
  "CleanDataService",
  "CMSConnectSource",
  "Community",
  "CommunityTemplateDefinition",
  "CommunityThemeDefinition",
  "CompactLayout",
  "ConnectedApp",
  "ContentAsset",
  "CorsWhitelistOrigin",
  "CspTrustedSite",
  "CustomApplication",
  "CustomApplicationComponent",
  "CustomFeedFilter",
  "CustomHelpMenuSection",
  "CustomLabels",
  "CustomMetadata",
  "CustomObjectTranslation",
  "CustomPageWebLink",
  "CustomPermission",
  "CustomSite",
  "CustomTab",
  "DataCategoryGroup",
  "DelegateGroup",
  "DuplicateRule",
  "EclairGeoData",
  "EntitlementProcess",
  "EntitlementTemplate",
  "ExperienceBundle",
  "ExternalDataSource",
  "ExternalServiceRegistration",
  "FeatureParameterBoolean",
  "FeatureParameterDate",
  "FeatureParameterInteger",
  "FieldSet",
  "FlexiPage",
  "Flow",
  "FlowCategory",
  "FlowDefinition",
  "GlobalValueSet",
  "GlobalValueSetTranslation",
  "Group",
  "HomePageComponent",
  "HomePageLayout",
  "InstalledPackage",
  "KeywordList",
  "Layout",
  "LightningBolt",
  "LightningComponentBundle",
  "LightningExperienceTheme",
  "LightningMessageChannel",
  "LiveChatAgentConfig",
  "LiveChatButton",
  "LiveChatDeployment",
  "LiveChatSensitiveDataRule",
  "ManagedTopics",
  "MatchingRules",
  "MilestoneType",
  "MlDomain",
  "ModerationRule",
  "MyDomainDiscoverableLogin",
  "NamedCredential",
  "NavigationMenu",
  "Network",
  "NetworkBranding",
  "OauthCustomScope",
  "PathAssistant",
  "PaymentGatewayProvider",
  "PermissionSet",
  "PlatformCachePartition",
  "PlatformEventChannel",
  "PlatformEventChannelMember",
  "Portal",
  "PostTemplate",
  "PresenceDeclineReason",
  "PresenceUserConfig",
  "Profile",
  "ProfilePasswordPolicy",
  "ProfileSessionSetting",
  "Prompt",
  "Queue",
  "QueueRoutingConfig",
  "QuickAction",
  "RecommendationStrategy",
  "RecordActionDeployment",
  "RedirectWhitelistUrl",
  "ReportType",
  "Role",
  "SamlSsoConfig",
  "Scontrol",
  "ServiceChannel",
  "ServicePresenceStatus",
  "Settings",
  "SharingRules",
  "SharingSet",
  "SiteDotCom",
  "Skill",
  "StandardValueSetTranslation",
  "StaticResource",
  "SynonymDictionary",
  "Territory",
  "Territory2",
  "Territory2Model",
  "Territory2Rule",
  "Territory2Type",
  "TimeSheetTemplate",
  "TopicsForObjects",
  "TransactionSecurityPolicy",
  "Translations",
  "WaveApplication",
  "WaveDashboard",
  "WaveDataflow",
  "WaveDataset",
  "WaveLens",
  "WaveRecipe",
  "WaveTemplateBundle",
  "WaveXmd",
  "Workflow",
  "WorkSkillRouting",
]);

/**
 * Metadata types that sf org list metadata-types returns but cannot actually
 * be listed or retrieved via the Metadata API.
 */
export const NON_RETRIEVABLE_TYPES = new Set([
  "EventDelivery",
  "EventSubscription",
  "Scontrol",
  "ArticleType",
  "CustomObject",
  "CustomField",
  "StandardValueSet",
  "FieldSet",
  "CompactLayout",
  "WebLink",
  "RecordType",
  "ValidationRule",
  "BusinessProcess",
  "ListView",
  "SharingReason",
  "InstalledPackage",
  "Portal",
  "Territory",
  "ChannelLayout",
]);

/** Map of folder-based metadata types to their folder type names. */
export const REPORT_FOLDER_MAP: Record<string, string> = {
  Dashboard: "DashboardFolder",
  Document: "DocumentFolder",
  EmailTemplate: "EmailFolder",
  Report: "ReportFolder",
};

// ── XML building helpers ──

const PACKAGE_START =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';
const TYPES_START = "<types>";
const TYPES_END = "</types>";
const MEMBERS_START = "<members>";
const MEMBERS_END = "</members>";
const NAME_START = "<name>";
const NAME_END = "</name>";
const VERSION_START = "<version>";
const VERSION_END = "</version>";
const PACKAGE_END = "</Package>";
const NL = "\n";
const TAB = "\t";
const LOADING = "*loading..";

// ── Public functions ──

export interface SelectedNode {
  text: string;
  parent: string;
}

export interface MetadataTypeEntry {
  id: string;
  isSelected: boolean;
  isIndeterminate?: boolean;
  children: { text: string; isSelected: boolean }[];
}

/**
 * Build a Map of metadata-type → members[] from the legacy jstree selectedNodes format.
 */
export function buildPackageMap(
  selectedNodes: SelectedNode[],
): Map<string, string[]> {
  const mpPackage = new Map<string, string[]>();

  for (const node of selectedNodes) {
    if (node.text === LOADING) {
      continue;
    }

    if (node.parent === "#") {
      // parent node
      if (!mpPackage.has(node.text)) {
        mpPackage.set(node.text, WILDCARD_TYPES.has(node.text) ? ["*"] : []);
      } else if (WILDCARD_TYPES.has(node.text)) {
        mpPackage.set(node.text, ["*"]);
      }
    } else {
      // child node
      if (!mpPackage.has(node.parent)) {
        mpPackage.set(node.parent, [node.text]);
      } else {
        const childArr = mpPackage.get(node.parent)!;
        if (!childArr.includes("*")) {
          childArr.push(node.text);
          mpPackage.set(node.parent, childArr);
        }
      }
    }
  }

  return mpPackage;
}

/**
 * Build a Map of metadata-type → members[] from the modern webview format.
 */
export function buildSelectedMetadataMap(
  metadataTypes: MetadataTypeEntry[],
): Map<string, string[]> {
  const mpPackage = new Map<string, string[]>();

  if (!metadataTypes || metadataTypes.length === 0) {
    return mpPackage;
  }

  for (const mt of metadataTypes) {
    if (mt.isSelected) {
      if (WILDCARD_TYPES.has(mt.id)) {
        mpPackage.set(mt.id, ["*"]);
      } else {
        mpPackage.set(
          mt.id,
          mt.children.map((c) => c.text),
        );
      }
    } else if (mt.isIndeterminate) {
      const selected = mt.children
        .filter((c) => c.isSelected)
        .map((c) => c.text);
      if (selected.length > 0) {
        mpPackage.set(mt.id, selected);
      }
    }
  }

  return mpPackage;
}

/**
 * Generate the package.xml string from a metadata map and API version.
 * Returns `null` if the map is empty/undefined.
 */
export function generatePackageXmlString(
  mpPackage: Map<string, string[]>,
  apiVersion: string,
): string | null {
  if (!mpPackage || mpPackage.size === 0) {
    return null;
  }

  let xml = PACKAGE_START;

  const sortedKeys = [...mpPackage.keys()].sort();
  for (const mType of sortedKeys) {
    const components = mpPackage.get(mType)!;

    // skip types with empty members
    if (!components || components.length === 0) {
      continue;
    }

    const sorted = [...components].sort();
    xml += TAB + TYPES_START + NL;
    for (const comp of sorted) {
      xml += TAB + TAB + MEMBERS_START + comp + MEMBERS_END + NL;
    }
    xml += TAB + TAB + NAME_START + mType + NAME_END + NL;
    xml += TAB + TYPES_END + NL;
  }

  xml += TAB + VERSION_START + apiVersion + VERSION_END + NL;
  xml += PACKAGE_END;
  return xml;
}

/**
 * Filter an array of metadata type names, removing any that are non-retrievable.
 */
export function filterRetrievableTypes(typeNames: string[]): string[] {
  return typeNames.filter((t) => !NON_RETRIEVABLE_TYPES.has(t));
}

/**
 * Check whether a cache object is still valid given the current API version.
 */
export function isCacheValid(
  cache: { timestamp?: number; apiVersion?: string } | null,
  currentApiVersion: string,
): boolean {
  if (!cache || !cache.timestamp) {
    return false;
  }
  if (cache.apiVersion !== currentApiVersion) {
    return false;
  }
  const age = Date.now() - cache.timestamp;
  return age <= CACHE_TTL_MS;
}
