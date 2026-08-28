export const getPrismaKnownErrors = (targets: string[]): Record<string, string[]> => {
    const errors: Record<string, string[]> = {};
    for (const target of targets) {
        errors[target] = [`${target.charAt(0).toUpperCase() + target.slice(1)} already in use`];
    }
    return errors;
};
