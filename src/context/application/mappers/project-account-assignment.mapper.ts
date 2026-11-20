export class ProjectAccountAssignmentMapper {
    public join(
        assignment: Entities.ProjectAccountAssignment,
        actor: string,
    ): Topics.Realm.MembershipJoinRequestedMessage["payload"] {
        return {
            actor,
            realm: assignment.project.realm,
            input: {
                membership: assignment.membership.id,
                account: assignment.membership.account,
                process: assignment.id,
                command: assignment.id,
            },
        };
    }

    public access(
        assignments: Entities.ProjectAccountAssignment[],
        actor: string,
    ): Topics.Realm.AccountAccessMessage["payload"][] {
        return assignments.map((assignment) => ({
            actor,
            realm: assignment.project.realm,
            input: { account: assignment.membership.account },
        }));
    }
}
