# deno-spa-proxy

This is an edge proxy is written in TypeScript and is focused on being as simple
as possible of a proxy for single page applications (SPAs).

The proxy is designed to work with containerized environments such as Kubernetes
and provides `/healthz` and `readyz` endpoints to facilitate the probes within
these systems for reliable pod orchestration.

There are many hosting platforms which can allow you to easily host your SPA
with cacheability (i.e. CDN) but they don't offer much flexibility in terms of
hosting content on bucket storage or other persistent data storage options. Some
examples of SPA deployment platform services are:

- https://developers.cloudflare.com/pages/
- https://vercel.com/
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html
- https://docs.netlify.com/configure-builds/javascript-spas/
- (There are many many more options)

## What is a Single Page Application (SPA)

A single-page application (SPA) is a web application or website that operates
within a single web page, without requiring the entire page to be reloaded
during user interaction.

The key characteristic of SPAs is that they load the initial HTML, CSS, and
JavaScript required for the application to function, and subsequent interactions
or data retrieval are performed using asynchronous techniques, such as Ajax, to
retrieve data from the server and update the page dynamically. This approach may
allow for faster and more interactive user experiences, as only the relevant
parts of the page are updated instead of reloading the entire page.

SPAs often rely on JavaScript frameworks or libraries, such as React, Angular,
or Vue.js, to facilitate the development and management of complex user
interfaces and data interactions. These frameworks provide tools and
abstractions to handle routing, state management, and efficient rendering of
components.

SPAs have unique routing and proxy requirements due to path routing being
handled within the frontend application. Static assets (i.e. JavaScript files,
CSS files...) tend to exist at a certain path on the domain hosting the
application (i.e. `/static/*`) and any paths which aren't part of the static
application need to return the `index.html` file with a status of `200`.

## Usage

Local development makes use of Deno's Task Runner. Commands are ran with
`deno task <command>`.

See [deno.jsonc](deno.jsonc) for a list of tasks that can be ran.

A routing configuration is required to be provided in a `config.ts` file which
exports `APPS`. The most basic form for `localhost` routing would look like:

```typescript
import { AppList } from "./types.ts";

export const APPS: AppList = {
  "localhost:3000": {
    uri: "https://storage.googleapis.com/some-bucket/frontends/some-app/master",
  },
};
```

In the aforementioned the
`https://storage.googleapis.com/some-bucket/frontends/some-app/master` would
contain the contents of the single page application static content.

If order to make use of the `/readyz` endpoint the readiness of the service is
defined by the presence of a file controlled by the `READY_FILE` environment
variable (i.e. `READY_FILE="./ready"`). This endpoint tends to be critical for
systems like Kubernetes which make use of load balancing to services (i.e.
Ingress, Gateway...). Since these are reconciliation systems which converge to a
certain state one must ensure that load balancers and/or services have been
provided enough time to deregister the proxy as an available pod from the load
balancers perspective. In Kubernetes this complexity is generally managed by
controllers (i.e. Ingress controller, Gateway controller...).

In Kubernetes this can all be handled with
[Container Lifecycle Hooks](https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/).
here's an example of possible hooks:

```yaml
lifecycle:
    postStart:
        exec:
        # Creates a $READY_FILE file which must exist for the container to be ready.
        command: ["/bin/sh", "-c", "touch $READY_FILE"]
    preStop:
        exec:
        # Delete the $READY_FILE so that the pod fails readiness and gets removed from the service.
        # Wait X seconds so that the service endpoints can be removed. This has to be coordinated with the
        # readinessProbe and time to detect not being ready.
        command: ["/bin/sh", "-c", "rm $READY_FILE; sleep 15"]
```

As stated in the comments within the example it is critical that the settings
for `readinessProbe` such as `failureThreshold` and `periodSeconds` are set
accordingly to fit within the sleep window and allow the pod to be detected as
failing readiness and being removed from the service. One must also consider the
Ingress or Gateway configuration in order to ensure that the load balancer also
stops routing to the pod. An example of a `BackendConfig` for the Google Cloud
Platform's GKE product and managed Ingress or Gateway may look like the
following:

```yaml
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: backend-config
spec:
  connectionDraining:
    drainingTimeoutSec: 65
  healthCheck:
    checkIntervalSec: 5
    timeoutSec: 2
    healthyThreshold: 2
    unhealthyThreshold: 2
    type: HTTP
    requestPath: /readyz
    port: 3000
  logging:
    enable: true
  timeoutSec: 60
```

The above would fail the health check within `10` seconds and thus have the pod
removed as a routing candidate from the load balancer. Each Kubernetes cluster
controller has its own little quicks and complexities and failure to pay
attention to this will result in `5xx` status codes from the load balancer.
