import axiosClient from "./axiosClient.js";

export async function getSystemResources(signal) {
  const { data } = await axiosClient.get("/config/system-resources/", { signal });
  return data;
}

export async function listLatestBackups(signal) {
  const { data } = await axiosClient.get("/config/backups/", { signal });
  return data;
}

export async function requestBackupDownload(kind, signal) {
  const path = `/config/backups/${kind}`;
  const { data } = await axiosClient.post(`${path}/download-ticket/`, null, { signal });
  return { ticket: data.ticket, action: axiosClient.getUri({ url: `${path}/download/` }) };
}
