const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const resolveRequestWithPackageExports = (context, moduleName, platform) => {
    if (moduleName === "jose") {
        const ctx = {
            ...context,
            unstable_conditionNames: ["browser"],
        };
        return ctx.resolveRequest(ctx, moduleName, platform);
    }

    if (moduleName.startsWith("@privy-io/")) {
        const ctx = {
            ...context,
            unstable_enablePackageExports: true,
        };
        return ctx.resolveRequest(ctx, moduleName, platform);
    }

    return context.resolveRequest(context, moduleName, platform);
};

config.resolver.resolveRequest = resolveRequestWithPackageExports;
module.exports = config;
