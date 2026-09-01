import { GraphQLClient } from "graphql-request";
import { readSecret } from "./secrets.js";

let client: GraphQLClient | null = null;

export function githubClient(): GraphQLClient {
  if (client) return client;
  const pat = readSecret("github_pat");
  client = new GraphQLClient("https://api.github.com/graphql", {
    headers: { authorization: `bearer ${pat}` },
  });
  return client;
}
