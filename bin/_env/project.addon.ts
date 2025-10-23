import type {AddonEntrypoint} from '@/loadAddons.ts';

export const addon: AddonEntrypoint = async (context) => ({
    commands: async (program) => {
        program
            .command('watch')
            .description('Watch for changes in the project and rebuild automatically')
            .action(() =>
                context.docker.executeCommandInService('node', ['npm', 'run', 'watch'], {foreground: true}).then());

        program
            .command('build')
            .description('Build the project')
            .action(() =>
                context.docker.executeCommandInService('node', ['npm', 'run', 'build'], {foreground: true}).then());
    }
});
