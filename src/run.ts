import * as core from '@actions/core';
import * as io from '@actions/io';
import * as path from 'path';
import * as toolCache from '@actions/tool-cache';

import { downloadKubectl, getStableKubectlVersion } from "./utilities/kubectl-util";
import { getExecutableExtension, isEqual } from "./utilities/utility";

import { Kubectl } from './kubectl-object-model';
import { deploy } from './utilities/strategy-helpers/deployment-helper';
import { promote } from './actions/promote';
import { reject } from './actions/reject';

let kubectlPath = "";

async function setKubectlPath() {
    if (core.getInput('kubectl-version')) {
        const version = core.getInput('kubectl-version');
        kubectlPath = toolCache.find('kubectl', version);
        if (!kubectlPath) {
            kubectlPath = await installKubectl(version);
        }
    } else {
        kubectlPath = await io.which('kubectl', false);
        if (!kubectlPath) {
            const allVersions = toolCache.findAllVersions('kubectl');
            kubectlPath = allVersions.length > 0 ? toolCache.find('kubectl', allVersions[0]) : '';
            if (!kubectlPath) {
                throw new Error('Kubectl is not installed, either add install-kubectl action or provide "kubectl-version" input to download kubectl');
            }
            kubectlPath = path.join(kubectlPath, `kubectl${getExecutableExtension()}`);
        }
    }
}

async function installKubectl(version: string) {
    if (isEqual(version, 'latest')) {
        version = await getStableKubectlVersion();
    }
    return await downloadKubectl(version);
}

function checkClusterContext() {
    if (!process.env["KUBECONFIG"]) {
        core.warning('KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context / aks-set-context action.');
    }
}

export async function run() {
    checkClusterContext();
    await setKubectlPath();
    let manifestsInput = core.getInput('manifests');
    if (!manifestsInput) {
        core.setFailed('No manifests supplied to deploy');
        return;
    }
    let namespace = core.getInput('namespace');
    if (!namespace) {
        namespace = 'default';
    }
    let action = core.getInput('action');
    let manifests = manifestsInput.split(/[\n,;]+/).filter(manifest => manifest.trim().length > 0);

    if (manifests.length > 0) {
        manifests = manifests.map(manifest => {
            return manifest.trim();
        });
    }

    if (action === 'deploy') {
        let strategy = core.getInput('strategy');
        console.log("strategy: ", strategy)
        await deploy(new Kubectl(kubectlPath, namespace), manifests, strategy);
    }
    else if (action === 'promote') {
        await promote();
    }
    else if (action === 'reject') {
        await reject();
    }
    else {
        core.setFailed('Not a valid action. The allowed actions are deploy, promote, reject');
    }
}

run().catch(core.setFailed);