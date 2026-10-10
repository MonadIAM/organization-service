declare namespace Commands.Mappers.Position {
    interface Contract extends PublicContract {}

    interface PublicContract {
        confirmed: Confirmed.Signature;
        rejected: Rejected.Signature;
    }

    namespace Confirmed {
        type Props = {
            request: Topics.Position.PlacementRequestedMessage["payload"];
        };

        type Result = Topics.Position.PlacementConfirmedMessage["payload"];

        type Signature = (props: Props) => Result;
    }

    namespace Rejected {
        type Props = {
            request: Topics.Position.PlacementRequestedMessage["payload"];
            reason: string;
        };

        type Result = Topics.Position.PlacementRejectedMessage["payload"];

        type Signature = (props: Props) => Result;
    }
}
