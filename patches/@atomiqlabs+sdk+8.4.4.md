# @atomiqlabs/sdk patch

Truncates LP discovery errors in `IntermediaryDiscovery.loadIntermediary()` so HTML error pages (e.g. Cloudflare 530 from a tunnel that is down) are no longer dumped line-by-line into the logs.

When the error message looks like an HTML document, the patch logs only `<ErrorName> (HTTP <code>): <title>` instead of the full body. Other errors are logged unchanged.
