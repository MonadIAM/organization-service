declare namespace Commands.Mappers.Department {
    interface Contract extends PublicContract {}

    interface PublicContract {
        referencePayload: ReferencePayload.Signature;
        purgePayload: PurgePayload.Signature;
    }

    namespace ReferencePayload {
        type Props = {
            department: Entities.Department;
            actor: string;
            realm: string;
        };

        type Result = Topics.Position.ReferenceRequestedMessage["payload"][];

        type Signature = (props: Props) => Result;
    }

    namespace PurgePayload {
        type Props = {
            departments: Entities.Department[];
            actor: string;
            realm: string;
        };

        type Result = Topics.Position.DepartmentPurgedMessage["payload"][];

        type Signature = (props: Props) => Result;
    }
}
