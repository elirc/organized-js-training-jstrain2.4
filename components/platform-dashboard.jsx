"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api";
import { usePlatformStore } from "@/lib/store";
import { AppSelector } from "@/components/app-selector";
import { DeploymentTimeline } from "@/components/deployment-timeline";
import { PipelineGraph } from "@/components/pipeline-graph";
import { LogStreamPanel } from "@/components/log-stream-panel";
import { MonitoringPanel } from "@/components/monitoring-panel";
import { FeatureFlagsPanel } from "@/components/feature-flags-panel";
import { SecretsPanel } from "@/components/secrets-panel";
import { AuditPanel } from "@/components/audit-panel";
import { EnvironmentPanel } from "@/components/environment-panel";

export function PlatformDashboard() {
  const {
    selectedAppId,
    selectedEnvironmentId,
    selectedDeploymentId,
    setSelectedAppId,
    setSelectedEnvironmentId,
    setSelectedDeploymentId,
  } = usePlatformStore();

  const bootstrap = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => fetchJson("/api/bootstrap"),
  });

  const teams = useMemo(() => bootstrap.data?.teams ?? [], [bootstrap.data]);
  const applications = useMemo(
    () => teams.flatMap((team) => team.applications),
    [teams],
  );

  useEffect(() => {
    if (!applications.length) return;
    if (!selectedAppId) {
      setSelectedAppId(applications[0].id);
      return;
    }
    if (!applications.find((application) => application.id === selectedAppId)) {
      setSelectedAppId(applications[0].id);
    }
  }, [applications, selectedAppId, setSelectedAppId]);

  const selectedApp = applications.find((application) => application.id === selectedAppId);

  useEffect(() => {
    if (!selectedApp) return;
    if (!selectedEnvironmentId) {
      setSelectedEnvironmentId(selectedApp.environments[0]?.id || null);
      return;
    }
    if (!selectedApp.environments.find((environment) => environment.id === selectedEnvironmentId)) {
      setSelectedEnvironmentId(selectedApp.environments[0]?.id || null);
    }
  }, [selectedApp, selectedEnvironmentId, setSelectedEnvironmentId]);

  useEffect(() => {
    if (!selectedApp) return;
    const deployments = selectedApp.deployments.filter((deployment) =>
      selectedEnvironmentId ? deployment.environmentId === selectedEnvironmentId : true,
    );
    if (!deployments.length) {
      setSelectedDeploymentId(null);
      return;
    }
    if (!selectedDeploymentId || !deployments.find((deployment) => deployment.id === selectedDeploymentId)) {
      setSelectedDeploymentId(deployments[0].id);
    }
  }, [selectedApp, selectedEnvironmentId, selectedDeploymentId, setSelectedDeploymentId]);

  if (bootstrap.isLoading) {
    return <main className="pageLoading">Loading internal platform...</main>;
  }

  if (bootstrap.error) {
    return <main className="pageLoading">Failed to load platform: {bootstrap.error.message}</main>;
  }

  if (!selectedApp) {
    return <main className="pageLoading">No applications found. Run `npm run db:seed` and refresh.</main>;
  }

  return (
    <main className="page">
      <header className="topBar">
        <div>
          <h1>Orbit Deploy Console</h1>
          <p>Internal developer platform for deploys, logs, feature controls, and infrastructure governance.</p>
        </div>
        <div className="stack alignEnd">
          <span className="muted">{bootstrap.data.name}</span>
          <span className="mono tiny">CLI mirror: /api/cli/*</span>
        </div>
      </header>

      <div className="layout">
        <AppSelector
          teams={teams}
          selectedAppId={selectedAppId}
          selectedEnvironmentId={selectedEnvironmentId}
          onSelectApp={setSelectedAppId}
          onSelectEnvironment={setSelectedEnvironmentId}
        />

        <section className="content stack">
          <DeploymentTimeline
            application={selectedApp}
            selectedEnvironmentId={selectedEnvironmentId}
            selectedDeploymentId={selectedDeploymentId}
            onSelectDeployment={setSelectedDeploymentId}
          />

          <div className="twoCol">
            <PipelineGraph application={selectedApp} />
            <EnvironmentPanel application={selectedApp} selectedEnvironmentId={selectedEnvironmentId} />
          </div>

          <LogStreamPanel deploymentId={selectedDeploymentId} />

          <MonitoringPanel applicationId={selectedApp.id} environmentId={selectedEnvironmentId} />

          <div className="twoCol">
            <FeatureFlagsPanel application={selectedApp} />
            <SecretsPanel application={selectedApp} />
          </div>

          <AuditPanel application={selectedApp} />
        </section>
      </div>
    </main>
  );
}
