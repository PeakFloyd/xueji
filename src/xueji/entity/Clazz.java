package xueji.entity;

/**
 * 班级实体，对应数据库表 clazz。
 * 班级归属于某个系（系号外键）。
 */
public class Clazz {

    /** 班号（主键）。 */
    private String classId;

    /** 班名。 */
    private String className;

    /** 所属系号（外键）。 */
    private String deptId;

    public Clazz() {
    }

    public Clazz(String classId, String className, String deptId) {
        this.classId = classId;
        this.className = className;
        this.deptId = deptId;
    }

    public String getClassId() {
        return classId;
    }

    public void setClassId(String classId) {
        this.classId = classId;
    }

    public String getClassName() {
        return className;
    }

    public void setClassName(String className) {
        this.className = className;
    }

    public String getDeptId() {
        return deptId;
    }

    public void setDeptId(String deptId) {
        this.deptId = deptId;
    }

    @Override
    public String toString() {
        return className == null ? classId : className;
    }
}
