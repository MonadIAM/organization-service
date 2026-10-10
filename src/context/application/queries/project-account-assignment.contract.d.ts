import { QueryMode, ResponseViewType } from "~context/enums";

declare global {
    namespace Queries.ProjectAccountAssignment {
        interface Contract extends PublicContract, InternalContract {}

        interface InternalContract {
            buildReadScope: BuildReadScope.Signature;
        }

        namespace BuildReadScope {
            type Props = {
                permissions: string[];
                actor: string;
                realm: string;
            };

            type Result = ORM.Prefilter<Entities.ProjectAccountAssignment>;

            type Signature = (props: Props) => Result;
        }

        interface PublicContract {
            findUnique: FindUnique.Signature;
            findMany: FindMany.Signature;
        }

        namespace FindUnique {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                view: ResponseViewType;
                permissions: string[];
                assignment: string;
                realm: string;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                view: ResponseViewType;
                assignment: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<Entities.ProjectAccountAssignment>;

            type Signature = (props: Props) => Result;
        }

        namespace FindMany {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                filters: Repositories.Mappers.ProjectAccountAssignment.Filters;
                sort: Repositories.Mappers.ProjectAccountAssignment.Sort;
                pagination: Pagination;
                view: ResponseViewType;
                permissions: string[];
                realm: string;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                filters: Repositories.Mappers.ProjectAccountAssignment.Filters;
                sort: Repositories.Mappers.ProjectAccountAssignment.Sort;
                pagination: Pagination;
                view: ResponseViewType;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.ProjectAccountAssignment[], number]>;

            type Signature = (props: Props) => Result;
        }
    }
}
