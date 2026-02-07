import Docker from "dockerode";

export const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function ensureNetwork(networkName: string): Promise<void> {
  const networks = await docker.listNetworks({
    filters: { name: [networkName] },
  });

  if (networks.length === 0) {
    await docker.createNetwork({
      Name: networkName,
      Driver: "bridge",
    });
  }
}

export async function ensureImage(imageName: string): Promise<void> {
  try {
    await docker.getImage(imageName).inspect();
  } catch {
    console.log(`Pulling image ${imageName}...`);
    const stream = await docker.pull(imageName);
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
