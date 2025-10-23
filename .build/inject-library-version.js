import fs from 'fs';

const versionFilePath = './src/version.ts';

export function preCommit({version}) {
    const defaultVersion = 'version: \'0.0.0\'';
    const newVersion = `version: '${version}'`;
    let content = fs.readFileSync(versionFilePath, 'utf8');
    content = content.replace(defaultVersion, newVersion);
    fs.writeFileSync(versionFilePath, content, 'utf8');
    console.log(`Injected version ${version} into ${versionFilePath}`);
    console.debug('Content after injection:', content);
}
