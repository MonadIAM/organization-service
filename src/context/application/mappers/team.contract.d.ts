declare namespace Commands.Mappers.Team {
    interface Contract extends PublicContract {}

    interface PublicContract {
        referencePayload: ReferencePayload.Signature;
        purgePayload: PurgePayload.Signature;
    }

    namespace ReferencePayload {
        type Props = {
            team: Entities.Team;
            actor: string;
            realm: string;
        };

        type Result = Topics.Position.ReferenceRequestedMessage["payload"][];

        type Signature = (props: Props) => Result;
    }

    namespace PurgePayload {
        type Props = {
            teams: Entities.Team[];
            actor: string;
            realm: string;
        };

        type Result = Topics.Position.TeamPurgedMessage["payload"][];

        type Signature = (props: Props) => Result;
    }
}
