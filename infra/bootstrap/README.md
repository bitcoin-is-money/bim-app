# Terraform backend bootstrap

One-shot sub-project that provisions the Scaleway Object Storage bucket used
as the remote backend for the main infra (`../main.tf`), plus the local
operator IAM application:

- **`bim-tfstate-rw`** — used by the local operator running `terraform apply`
  on the main infra.

CI read access to the tfstate is granted through the `bim-ci` IAM app defined
in the main infra (`../main.tf`), which bundles tfstate read + image push +
container redeploy permissions into a single key.

The state of **this** sub-project is kept local. It is tiny, rarely changes,
and only the primary operator runs it.

## First-time setup

```sh
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars
# edit project_id in terraform.tfvars
terraform init
terraform apply
```

Capture the rw API key from the outputs and store it in the password
manager:

```sh
terraform output -raw rw_access_key
terraform output -raw rw_secret_key
```

The **rw** pair is used by the local operator (export as
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` when running
`terraform -chdir=infra *`).

The CI key pair (used by GitHub Actions) comes from the main infra — see
`bim-ci` in `../main.tf`.

## Why a separate sub-project

Chicken-and-egg: the backend bucket must exist before the main infra can
configure `backend "s3"`. Keeping the bucket in a separate root avoids
entangling its lifecycle with the app infra.
