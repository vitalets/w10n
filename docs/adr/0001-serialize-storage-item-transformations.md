# Serialize storage item transformations

Storage-item writes accept only transformation functions and queue the complete read–transform–write operation, preventing lost updates when concurrent callers share one instance. The queue also orders reads and removals, continues after individual failures, and treats an `undefined` transformation result as a non-destructive no-op; removal stays explicit. This guarantee intentionally stops at one instance in one JavaScript realm; broader coordination would require a cross-context protocol.
