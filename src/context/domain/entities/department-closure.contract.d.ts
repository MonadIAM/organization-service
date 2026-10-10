declare namespace Entities {
    type DepartmentClosure = DepartmentClosure.Contract;

    namespace DepartmentClosure {
        interface Contract {
            depth: number;

            descendant: Entities.Department;
            ancestor: Entities.Department;
            organization: Entities.Organization;
        }

        type ConstructorProps = {
            depth: number;
            descendant: Entities.Department;
            ancestor: Entities.Department;
            organization: Entities.Organization;
        };
    }
}
