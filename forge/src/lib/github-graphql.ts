import { GraphQLClient } from "graphql-request";

let client: GraphQLClient | null = null;

export function githubClient(): GraphQLClient {
  if (client) return client;
  const pat = process.env["GITHUB_PAT"];
  if (!pat) throw new Error("GITHUB_PAT is not set; provide it in .env");
  client = new GraphQLClient("https://api.github.com/graphql", {
    headers: { authorization: `bearer ${pat}` },
  });
  return client;
}
