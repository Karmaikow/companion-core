#include <sys/prctl.h>
#include <signal.h>
#include <unistd.h>
#include <stdlib.h>
// Ensure native inference cannot outlive the private Core process, even after a crash.
int main(int argc, char **argv) {
 if (argc < 2) return 2;
 const char *parent = getenv("COMPANION_PARENT_PID");
 if (!parent || prctl(PR_SET_PDEATHSIG, SIGKILL) != 0 || getppid() != atoi(parent)) return 3;
 execv(argv[1], argv + 1);
 return 4;
}
