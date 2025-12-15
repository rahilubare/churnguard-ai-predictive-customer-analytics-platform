/**
 * Entities for ChurnGuard AI.
 */
import { IndexedEntity } from "./core-utils";
import type { User, ModelArtifact, SessionState, OrgState, Role } from "@shared/types";
// USER ENTITY
export class UserEntity extends IndexedEntity<User> {
  static readonly entityName = "user";
  static readonly indexName = "users";
  static readonly initialState: User = {
    id: "",
    email: "",
    passwordHash: "",
    orgId: "",
    role: "member" as Role,
  };
  static seedData = []; // No seed data for production users
}
// ORGANIZATION ENTITY
export class OrgEntity extends IndexedEntity<OrgState> {
  static readonly entityName = "org";
  static readonly indexName = "orgs";
  static readonly initialState: OrgState = {
    id: "",
    name: "",
    subTier: "free",
    maxRows: 10000,
  };
}
// SESSION ENTITY (for token-based auth)
export class SessionEntity extends IndexedEntity<SessionState> {
  static readonly entityName = "session";
  static readonly indexName = "sessions";
  static readonly initialState: SessionState = {
    userId: "",
    orgId: "",
    exp: 0,
  };
  // Use session token as the ID
  static override keyOf(state: SessionState & { id: string }): string {
    return state.id;
  }
}
// MODEL ENTITY: Stores trained model artifacts
export class ModelEntity extends IndexedEntity<ModelArtifact> {
  static readonly entityName = "model";
  static readonly indexName = "models";
  static readonly initialState: ModelArtifact = {
    id: "",
    orgId: "",
    name: "",
    createdAt: 0,
    targetVariable: "",
    features: [],
    performance: {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      rocAuc: 0,
      confusionMatrix: {
        truePositive: 0,
        trueNegative: 0,
        falsePositive: 0,
        falseNegative: 0,
      },
    },
    encodingMap: {},
    modelJson: "{}",
  };
}